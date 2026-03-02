import { TaskStatus, type Prisma } from "@prisma/client";

import type { DaemonTask } from "../../shared/contracts/task";
import { buildHistoryBundle, selectRecentMessages } from "./task-history";
import { prisma } from "./prisma";
import { extractListIdsFromText } from "./list-tokens";

const MAX_FETCH_LIMIT = 20;
const MIN_FETCH_LIMIT = 1;
const MODEL_CANONICAL_ALIASES: Readonly<Record<string, string>> = {
  "codex-bengalfox": "gpt-5.3-codex-spark",
  default: "gpt-5.3-codex",
};

type TaskWithContext = Prisma.TaskGetPayload<{
  include: {
    project: {
      select: {
        path: true;
      };
    };
    subproject: {
      select: {
        path: true;
      };
    };
  };
}>;

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return MIN_FETCH_LIMIT;
  }

  return Math.max(MIN_FETCH_LIMIT, Math.min(MAX_FETCH_LIMIT, Math.floor(limit)));
}

function toCanonicalModelIdentifier(value: string): string {
  const canonical = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  if (!canonical) {
    return "";
  }

  return MODEL_CANONICAL_ALIASES[canonical] ?? canonical;
}

function normalizeDisallowedModels(models: string[] | undefined): string[] {
  if (!Array.isArray(models) || models.length < 1) {
    return [];
  }

  const normalized = new Set<string>();
  for (const value of models) {
    if (typeof value !== "string") {
      continue;
    }
    const canonical = toCanonicalModelIdentifier(value);
    if (canonical.length > 0) {
      normalized.add(canonical);
    }
  }

  return [...normalized];
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

    const previousTasks = await tx.task.findMany({
      orderBy: [{ statusUpdatedAt: "desc" }, { createdAt: "desc" }],
      take: Math.floor(task.previousContextMessages),
      where: {
        id: {
          not: task.id,
        },
        projectId: task.projectId,
        status: {
          in: [TaskStatus.done, TaskStatus.failed, TaskStatus.stopped],
        },
        subprojectId: task.subprojectId ?? null,
      },
    });

    const bundle = buildHistoryBundle(
      selectRecentMessages(
        previousTasks.map((previousTask) => ({
          createdAt: previousTask.statusUpdatedAt,
          text: previousTask.text,
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

async function attachListExecutionContext(
  tx: Prisma.TransactionClient,
  tasks: DaemonTask[],
): Promise<DaemonTask[]> {
  const referencedIds = new Set<string>();
  const referencedByTask = new Map<string, string[]>();

  for (const task of tasks) {
    const taskListIds = extractListIdsFromText(task.text);
    referencedByTask.set(task.id, taskListIds);
    for (const listId of taskListIds) {
      referencedIds.add(listId);
    }
  }

  if (referencedIds.size < 1) {
    return tasks;
  }

  const rows = await tx.reusableListItem.findMany({
    orderBy: [{ listId: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
    select: {
      listId: true,
      value: true,
    },
    where: {
      listId: {
        in: [...referencedIds],
      },
    },
  });

  const valuesByListId = new Map<string, string[]>();
  for (const row of rows) {
    const existing = valuesByListId.get(row.listId);
    if (existing) {
      existing.push(row.value);
      continue;
    }
    valuesByListId.set(row.listId, [row.value]);
  }

  return tasks.map((task) => {
    const taskListIds = referencedByTask.get(task.id) ?? [];
    if (taskListIds.length !== 1) {
      return {
        ...task,
        listExecution: null,
      };
    }

    const listId = taskListIds[0]!;
    return {
      ...task,
      listExecution: {
        items: valuesByListId.get(listId) ?? [],
        listId,
      },
    };
  });
}

export async function claimNextTasksFromDb(
  limit: number,
  disallowedModels?: string[],
): Promise<DaemonTask[]> {
  const normalizedLimit = clampLimit(limit);
  const normalizedDisallowedModels = normalizeDisallowedModels(disallowedModels);
  const disallowedModelSet = new Set(normalizedDisallowedModels);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.task.findMany({
      include: {
        project: {
          select: {
            path: true,
          },
        },
        subproject: {
          select: {
            path: true,
          },
        },
      },
      orderBy: [
        { project: { priority: "asc" } },
        { project: { createdAt: "asc" } },
        { priority: "asc" },
        { createdAt: "asc" },
      ],
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

    const selectedProjectId = candidates[0]?.projectId;
    if (!selectedProjectId) {
      return [];
    }

    const selected: DaemonTask[] = [];
    for (const candidate of candidates) {
      if (candidate.projectId !== selectedProjectId) {
        continue;
      }

      if (selected.length >= normalizedLimit) {
        break;
      }

      if (disallowedModelSet.has(toCanonicalModelIdentifier(candidate.model))) {
        break;
      }

      selected.push(toDaemonTask(candidate));
    }

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

    const withListReferences = await attachListExecutionContext(tx, selected);
    return attachPreviousContextHistory(tx, withListReferences);
  });
}
