import { TaskStatus, type Prisma } from "@prisma/client";

import type {
  DaemonTask,
  DaemonTaskStatus,
  ImmediateAction,
} from "../../shared/contracts/task";
import { selectParallelTasks } from "../../shared/logic/task-priority";
import { publishAppSync } from "./live-sync";
import { prisma } from "./prisma";
import { buildHistoryBundle, selectRecentMessages } from "./task-history";

const MAX_FETCH_LIMIT = 20;
const MIN_FETCH_LIMIT = 1;

type TaskWithContext = Prisma.TaskGetPayload<{
  include: {
    project: true;
    subproject: true;
  };
}>;

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return MIN_FETCH_LIMIT;
  }

  return Math.max(MIN_FETCH_LIMIT, Math.min(MAX_FETCH_LIMIT, Math.floor(limit)));
}

function toDaemonTask(task: TaskWithContext): DaemonTask {
  return {
    id: task.id,
    includeHistory: task.includePreviousContext,
    model: task.model,
    priority: task.priority,
    previousContextMessages: task.previousContextMessages,
    projectId: task.projectId,
    reasoning: task.reasoning,
    subprojectId: task.subprojectId,
    text: task.text,
    contextPath: task.subproject?.path ?? task.project.path,
  };
}

async function attachPreviousContextHistory(
  tx: Prisma.TransactionClient,
  tasks: DaemonTask[],
): Promise<DaemonTask[]> {
  const enriched: DaemonTask[] = [];

  for (const task of tasks) {
    if (
      !task.includeHistory ||
      !task.previousContextMessages ||
      task.previousContextMessages < 1
    ) {
      enriched.push(task);
      continue;
    }

    const responses = await tx.taskResponse.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: Math.floor(task.previousContextMessages),
      where: {
        taskId: {
          not: task.id,
        },
        task: {
          projectId: task.projectId,
          subprojectId: task.subprojectId ?? null,
        },
      },
    });

    const bundle = buildHistoryBundle(
      selectRecentMessages(
        responses.map((response) => ({
          createdAt: response.createdAt,
          text: response.fullText,
        })),
        task.previousContextMessages,
      ),
    );

    enriched.push({
      ...task,
      history: bundle,
    });
  }

  return enriched;
}

function toImmediateAction(action: {
  id: string;
  taskId: string;
  type: "force_stop";
}): ImmediateAction {
  return {
    id: action.id,
    taskId: action.taskId,
    type: action.type,
  };
}

export async function claimNextTasks(limit: number): Promise<DaemonTask[]> {
  const normalizedLimit = clampLimit(limit);
  const now = new Date();

  const claimedTasks = await prisma.$transaction(async (tx) => {
    const runningTasks = await tx.task.findMany({
      select: {
        id: true,
        projectId: true,
        subprojectId: true,
      },
      where: {
        status: TaskStatus.in_progress,
      },
    });

    const activeScopeKeys = new Set(
      runningTasks.map((task) =>
        task.subprojectId
          ? `subproject:${task.projectId}:${task.subprojectId}`
          : `project:${task.projectId}`,
      ),
    );

    const candidates = await tx.task.findMany({
      include: {
        project: true,
        subproject: true,
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: normalizedLimit * 10,
      where: {
        editLocked: false,
        paused: false,
        status: TaskStatus.created,
        project: {
          paused: false,
        },
        OR: [
          { subprojectId: null },
          {
            subproject: {
              paused: false,
            },
          },
        ],
      },
    });

    const selected = selectParallelTasks(
      candidates.map(toDaemonTask),
      normalizedLimit,
      activeScopeKeys,
    );

    if (selected.length < 1) {
      return [];
    }

    const selectedIds = selected.map((task) => task.id);

    await tx.task.updateMany({
      data: {
        editLocked: true,
        inProgressAt: now,
        status: TaskStatus.in_progress,
        statusUpdatedAt: now,
      },
      where: {
        id: { in: selectedIds },
        status: TaskStatus.created,
      },
    });

    await tx.taskExecution.createMany({
      data: selectedIds.map((taskId) => ({
        prompt: null,
        startedAt: now,
        status: TaskStatus.in_progress,
        taskId,
      })),
    });

    return attachPreviousContextHistory(tx, selected);
  });

  if (claimedTasks.length > 0) {
    publishAppSync("task.claimed");
  }

  return claimedTasks;
}

function mapStatus(status: DaemonTaskStatus): TaskStatus {
  switch (status) {
    case "created":
      return TaskStatus.created;
    case "in_progress":
      return TaskStatus.in_progress;
    case "done":
      return TaskStatus.done;
    case "failed":
      return TaskStatus.failed;
    case "stopped":
      return TaskStatus.stopped;
  }
}

export async function updateTaskStatus(
  taskId: string,
  status: DaemonTaskStatus,
  fullResponse?: string,
  idempotencyKey?: string,
): Promise<boolean> {
  const now = new Date();
  const dbStatus = mapStatus(status);
  let changed = false;

  const updated = await prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.taskStatusUpdate.findUnique({
        where: {
          idempotencyKey,
        },
      });
      if (existing) {
        return true;
      }
    }

    const taskUpdateData: Prisma.TaskUpdateManyMutationInput = {
      editLocked: status === "in_progress",
      status: dbStatus,
      statusUpdatedAt: now,
    };

    if (status === "done") {
      taskUpdateData.doneAt = now;
      taskUpdateData.editLocked = false;
    } else if (status === "failed") {
      taskUpdateData.failedAt = now;
      taskUpdateData.editLocked = false;
    } else if (status === "stopped") {
      taskUpdateData.stoppedAt = now;
      taskUpdateData.editLocked = false;
    }

    const updated = await tx.task.updateMany({
      data: taskUpdateData,
      where: {
        id: taskId,
      },
    });

    if (updated.count < 1) {
      return false;
    }
    changed = true;

    if (typeof fullResponse === "string" && fullResponse.length > 0) {
      await tx.taskResponse.create({
        data: {
          fullText: fullResponse,
          taskId,
        },
      });
    }

    if (
      status === "done" ||
      status === "failed" ||
      status === "stopped"
    ) {
      await tx.taskExecution.updateMany({
        data: {
          finishedAt: now,
          status: dbStatus,
        },
        where: {
          finishedAt: null,
          taskId,
        },
      });
    }

    if (idempotencyKey) {
      await tx.taskStatusUpdate.create({
        data: {
          idempotencyKey,
          status: dbStatus,
          taskId,
        },
      });
    }

    return true;
  });

  if (updated && changed) {
    publishAppSync(`task.status.${status}`);
  }

  return updated;
}

export async function fetchPendingImmediateActions(): Promise<ImmediateAction[]> {
  const actions = await prisma.immediateAction.findMany({
    orderBy: [{ createdAt: "asc" }],
    take: 100,
    where: {
      status: "pending",
      type: "force_stop",
    },
  });

  return actions.map((action) =>
    toImmediateAction({
      id: action.id,
      taskId: action.taskId,
      type: action.type,
    }),
  );
}

export async function acknowledgeImmediateAction(
  actionId: string,
): Promise<boolean> {
  const updated = await prisma.immediateAction.updateMany({
    data: {
      acknowledgedAt: new Date(),
      status: "acknowledged",
    },
    where: {
      id: actionId,
      status: "pending",
    },
  });

  return updated.count > 0;
}

export async function completeImmediateAction(
  actionId: string,
): Promise<boolean> {
  const updated = await prisma.immediateAction.updateMany({
    data: {
      executedAt: new Date(),
      status: "executed",
    },
    where: {
      id: actionId,
      status: {
        in: ["pending", "acknowledged"],
      },
    },
  });

  return updated.count > 0;
}

export async function registerImmediateAction(
  taskId: string,
  type: "force_stop" = "force_stop",
): Promise<{ actionId: string; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.immediateAction.findFirst({
      select: { id: true },
      where: {
        status: {
          in: ["pending", "acknowledged"],
        },
        taskId,
        type,
      },
    });

    if (existing) {
      return {
        actionId: existing.id,
        created: false,
      };
    }

    const created = await tx.immediateAction.create({
      data: {
        status: "pending",
        taskId,
        type,
      },
      select: {
        id: true,
      },
    });

    return {
      actionId: created.id,
      created: true,
    };
  });
}
