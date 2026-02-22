import { Prisma, TaskStatus } from "@prisma/client";

import type {
  InstructionSetEntity,
  InstructionSetTreeItem,
  InstructionTaskEntity,
} from "../../shared/contracts";
import {
  type SkillTaskLinkMetadata,
  buildSkillTaskMetadata,
  parseSkillTaskMetadata,
  resolveSkillSetTasks,
  shouldSyncFromSkillTask,
} from "./skill-set-links";
import { publishAppSync } from "./live-sync";
import { prisma } from "./prisma";
import { DEFAULT_TASK_MODEL, DEFAULT_TASK_REASONING } from "./task-reasoning";

function toInstructionSetEntity(input: {
  createdAt: Date;
  description: string | null;
  metadata: Prisma.JsonValue | null;
  id: string;
  imagePath: string | null;
  mainPageTasksVisible: boolean;
  name: string;
  priority: number;
  updatedAt: Date;
}): InstructionSetEntity {
  return {
    createdAt: input.createdAt.toISOString(),
    description: input.description,
    linkedInstructionSetIds: normalizeLinkedInstructionSetIds(input.metadata),
    id: input.id,
    imagePath: input.imagePath,
    mainPageTasksVisible: input.mainPageTasksVisible,
    name: input.name,
    priority: input.priority,
    updatedAt: input.updatedAt.toISOString(),
  };
}

function normalizeLinkedInstructionSetIds(
  input: Prisma.JsonValue | null | undefined,
): string[] {
  if (!input || typeof input !== "object") {
    return [];
  }

  const rawValue = (input as { linkedInstructionSetIds?: unknown }).linkedInstructionSetIds;
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const normalized = rawValue
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  return Array.from(new Set(normalized));
}

interface InstructionTaskLinkMatch {
  editLocked: boolean;
  id: string;
  metadata: SkillTaskLinkMetadata;
  projectId: string;
  status: TaskStatus;
  subprojectId: string | null;
}

interface InstructionTaskCopyScope {
  instructionSetId: string;
  instructionSetName: string;
  projectId: string;
  subprojectId: string | null;
}

interface ProjectInstructionTaskRow {
  createdAt: Date;
  id: string;
  metadata: Prisma.JsonValue;
  projectId: string;
  subprojectId: string | null;
  priority: number;
}

function buildProjectTaskMetadata({
  instructionSetId,
  instructionSetName,
  sourceInstructionTask,
}: {
  instructionSetId: string;
  instructionSetName: string;
  sourceInstructionTask: {
    id: string;
    sourceInstructionSetId: string;
    sourceInstructionSetName: string;
  };
}): Prisma.InputJsonValue {
    return JSON.parse(
      buildSkillTaskMetadata({
      instructionSetId,
      instructionSetName,
      instructionTaskId: sourceInstructionTask.id,
      sourceInstructionSetId: sourceInstructionTask.sourceInstructionSetId,
      sourceInstructionSetName: sourceInstructionTask.sourceInstructionSetName,
      isManuallyEdited: false,
    }),
  ) as Prisma.InputJsonValue;
}

function buildProjectTaskMetadataForUpdate(
  link: InstructionTaskLinkMatch,
  sourceTaskId: string,
): Prisma.InputJsonValue {
      return JSON.parse(
    buildSkillTaskMetadata({
      instructionSetId: link.metadata.instructionSetId,
      instructionSetName: link.metadata.instructionSetName,
      instructionTaskId: sourceTaskId,
      sourceInstructionSetId: link.metadata.sourceInstructionSetId,
      sourceInstructionSetName: link.metadata.sourceInstructionSetName,
      isManuallyEdited: link.metadata.isManuallyEdited,
    }),
  ) as Prisma.InputJsonValue;
}

async function listProjectTasksLinkedToInstructionTask(
  sourceInstructionSetId: string,
  sourceInstructionTaskId?: string,
): Promise<InstructionTaskLinkMatch[]> {
  const taskRows = await prisma.task.findMany({
    select: {
      editLocked: true,
      id: true,
      metadata: true,
      projectId: true,
      status: true,
      subprojectId: true,
    },
    where: {
      metadata: { not: Prisma.JsonNull },
    },
  });

  const matches: InstructionTaskLinkMatch[] = [];
  for (const task of taskRows) {
    const metadata = parseSkillTaskMetadata(task.metadata);
    if (!metadata || metadata.sourceInstructionSetId !== sourceInstructionSetId) {
      continue;
    }

    if (
      typeof sourceInstructionTaskId === "string" &&
      metadata.instructionTaskId !== sourceInstructionTaskId
    ) {
      continue;
    }

    matches.push({
      editLocked: task.editLocked,
      id: task.id,
      metadata,
      projectId: task.projectId,
      status: task.status,
      subprojectId: task.subprojectId,
    });
  }

  return matches;
}

function listProjectTaskCopyScopesForSourceSet(
  matches: InstructionTaskLinkMatch[],
  sourceInstructionSetId: string,
): InstructionTaskCopyScope[] {
  const scopesByKey = new Map<string, InstructionTaskCopyScope>();

  for (const match of matches) {
    if (match.metadata.sourceInstructionSetId !== sourceInstructionSetId) {
      continue;
    }

    const key = `${match.projectId}|${match.subprojectId ?? ""}|${match.metadata.instructionSetId}`;
    if (scopesByKey.has(key)) {
      continue;
    }

    scopesByKey.set(key, {
      instructionSetId: match.metadata.instructionSetId,
      instructionSetName: match.metadata.instructionSetName,
      projectId: match.projectId,
      subprojectId: match.subprojectId,
    });
  }

  return [...scopesByKey.values()];
}

function collectInstructionSetComposersForSourceSet(
  instructionSets: readonly InstructionSetTreeItem[],
  sourceSetId: string,
): string[] {
  const setById = new Map<string, InstructionSetTreeItem>(
    instructionSets.map((instructionSet) => [instructionSet.id, instructionSet]),
  );

  return instructionSets
    .filter((instructionSet) => {
      const visited = new Set<string>();
      const queue = [instructionSet.id];

      while (queue.length > 0) {
        const currentId = queue.pop();
        if (!currentId || visited.has(currentId)) {
          continue;
        }
        if (currentId === sourceSetId) {
          return true;
        }

        visited.add(currentId);

        const currentSet = setById.get(currentId);
        if (!currentSet) {
          continue;
        }

        for (const linkedSetId of currentSet.linkedInstructionSetIds ?? []) {
          queue.push(linkedSetId);
        }
      }

      return false;
    })
    .map((instructionSet) => instructionSet.id);
}

function applyInstructionTaskPriorityReorder(
  composerSetId: string,
  rows: readonly ProjectInstructionTaskRow[],
  resolvedTaskIds: readonly string[],
): Array<{ id: string; priority: number }> {
  if (rows.length < 1) {
    return [];
  }

  const updates: Array<{ id: string; priority: number }> = [];

  const allowedTaskIds = new Set(resolvedTaskIds);
  const scopeRows = [...rows]
    .filter((row) => {
      const metadata = parseSkillTaskMetadata(row.metadata);
      return (
        metadata !== null &&
        metadata.instructionSetId === composerSetId &&
        allowedTaskIds.has(metadata.instructionTaskId)
      );
    })
    .sort(
      (left, right) =>
        left.priority - right.priority || left.createdAt.getTime() - right.createdAt.getTime(),
    );

  if (scopeRows.length < 1) {
    return [];
  }

  const availableBySourceTaskId = new Map<string, ProjectInstructionTaskRow[]>();
  for (const row of scopeRows) {
    const metadata = parseSkillTaskMetadata(row.metadata);
    if (!metadata) {
      continue;
    }

    const sourceTaskId = metadata.instructionTaskId;
    const bucket = availableBySourceTaskId.get(sourceTaskId);
    if (bucket) {
      bucket.push(row);
    } else {
      availableBySourceTaskId.set(sourceTaskId, [row]);
    }
  }

  const desiredRows: ProjectInstructionTaskRow[] = [];
  for (const sourceTaskId of resolvedTaskIds) {
    const candidates = availableBySourceTaskId.get(sourceTaskId);
    const picked = candidates?.shift();
    if (picked) {
      desiredRows.push(picked);
    }
  }

  const maxIndex = Math.min(desiredRows.length, scopeRows.length);
  for (let index = 0; index < maxIndex; index += 1) {
    const desired = desiredRows[index];
    const slot = scopeRows[index];
    if (!desired || !slot || desired.id === slot.id) {
      continue;
    }
    updates.push({ id: desired.id, priority: slot.priority });
  }

  return updates;
}

async function getNextTaskPriority(
  projectId: string,
  subprojectId: string | null,
): Promise<number> {
  const latestTask = await prisma.task.findFirst({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: { priority: true },
    where: {
      projectId,
      subprojectId,
    },
  });

  return latestTask ? latestTask.priority + 1 : 0;
}

function toInstructionTaskEntity(input: {
  createdAt: Date;
  id: string;
  includePreviousContext: boolean;
  instructionSetId: string;
  model: string;
  paused: boolean;
  previousContextMessages: number;
  priority: number;
  reasoning: string;
  text: string;
  updatedAt: Date;
}): InstructionTaskEntity {
  return {
    createdAt: input.createdAt.toISOString(),
    id: input.id,
    includePreviousContext: input.includePreviousContext,
    instructionSetId: input.instructionSetId,
    model: input.model,
    paused: input.paused,
    previousContextMessages: input.previousContextMessages,
    priority: input.priority,
    reasoning: input.reasoning,
    text: input.text,
    updatedAt: input.updatedAt.toISOString(),
  };
}

async function nextInstructionSetPriority(): Promise<number> {
  const latest = await prisma.skillSet.findFirst({
    orderBy: [{ priority: "desc" }],
    select: { priority: true },
  });

  return latest ? latest.priority + 1 : 0;
}

async function nextInstructionTaskPriority(instructionSetId: string): Promise<number> {
  const latest = await prisma.skillTask.findFirst({
    orderBy: [{ priority: "desc" }],
    select: { priority: true },
    where: { instructionSetId },
  });

  return latest ? latest.priority + 1 : 0;
}

export async function listInstructionSetsTree(): Promise<InstructionSetTreeItem[]> {
    const sets = await prisma.skillSet.findMany({
    include: {
      tasks: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return sets.map((set) => ({
    ...toInstructionSetEntity(set),
    tasks: set.tasks.map(toInstructionTaskEntity),
  }));
}

export async function getInstructionSetById(
  instructionSetId: string,
): Promise<InstructionSetTreeItem | null> {
  const set = await prisma.skillSet.findUnique({
    include: {
      tasks: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
    },
    where: { id: instructionSetId },
  });

  if (!set) {
    return null;
  }

  return {
    ...toInstructionSetEntity(set),
    tasks: set.tasks.map(toInstructionTaskEntity),
  };
}

export async function getInstructionSetImageInfoById(
  instructionSetId: string,
): Promise<{ imagePath: string | null } | null> {
  const set = await prisma.skillSet.findUnique({
    select: {
      imagePath: true,
    },
    where: { id: instructionSetId },
  });

  if (!set) {
    return null;
  }

  return { imagePath: set.imagePath };
}

export async function createInstructionSet(input: {
  description?: string;
  name: string;
}): Promise<InstructionSetEntity> {
  const priority = await nextInstructionSetPriority();
  const set = await prisma.skillSet.create({
    data: {
      description: input.description?.trim() || null,
      name: input.name.trim(),
      priority,
    },
  });

  publishAppSync("instructions.created");
  return toInstructionSetEntity(set);
}

export async function updateInstructionSet(
  instructionSetId: string,
  input: Partial<{
    linkedInstructionSetIds: string[];
    description: string | null;
    mainPageTasksVisible: boolean;
    name: string;
  }>,
): Promise<InstructionSetEntity> {
  const data: Prisma.SkillSetUpdateInput = {
    description:
      input.description === undefined ? undefined : input.description?.trim() || null,
    mainPageTasksVisible: input.mainPageTasksVisible,
    name: input.name?.trim(),
  };

  if (input.linkedInstructionSetIds !== undefined) {
    const normalized = Array.from(
      new Set(
        input.linkedInstructionSetIds
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && id !== instructionSetId),
      ),
    );
    data.metadata = { linkedInstructionSetIds: normalized };
  }

  const set = await prisma.skillSet.update({
    data,
    where: { id: instructionSetId },
  });

  publishAppSync("instructions.updated");
  return toInstructionSetEntity(set);
}

export async function setInstructionSetImagePath(
  instructionSetId: string,
  imagePath: string | null,
): Promise<InstructionSetEntity> {
  const set = await prisma.skillSet.update({
    data: {
      imagePath,
    },
    where: { id: instructionSetId },
  });

  publishAppSync("instructions.updated");
  return toInstructionSetEntity(set);
}

export async function deleteInstructionSet(instructionSetId: string): Promise<void> {
  await prisma.skillSet.delete({
    where: { id: instructionSetId },
  });
  publishAppSync("instructions.deleted");
}

export async function reorderInstructionSets(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((instructionSetId, index) =>
      prisma.skillSet.update({
        data: { priority: index },
        where: { id: instructionSetId },
      }),
    ),
  );

  publishAppSync("instructions.reordered");
}

export async function createInstructionTask(input: {
  includePreviousContext?: boolean;
  instructionSetId: string;
  model?: string;
  duplicateCount?: number;
  previousContextMessages?: number;
  reasoning?: string;
  text: string;
}): Promise<InstructionTaskEntity> {
  const duplicateCount = Number.isFinite(input.duplicateCount)
    ? Math.max(1, Math.floor(input.duplicateCount))
    : 1;
  const sourceSet = await prisma.skillSet.findUnique({
    select: { name: true },
    where: { id: input.instructionSetId },
  });
  const sourceSetName = sourceSet?.name?.trim() ?? input.instructionSetId;

  const existingProjectTaskLinks = await listProjectTasksLinkedToInstructionTask(
    input.instructionSetId,
  );
  const copyScopes = listProjectTaskCopyScopesForSourceSet(
    existingProjectTaskLinks,
    input.instructionSetId,
  );

  const createdTasks: InstructionTaskEntity[] = [];
  for (let index = 0; index < duplicateCount; index += 1) {
    const priority = await nextInstructionTaskPriority(input.instructionSetId);
    const task = await prisma.skillTask.create({
      data: {
        includePreviousContext: input.includePreviousContext ?? false,
        instructionSetId: input.instructionSetId,
        model: input.model?.trim() || DEFAULT_TASK_MODEL,
        previousContextMessages: input.previousContextMessages ?? 0,
        priority,
        reasoning: input.reasoning?.trim() || DEFAULT_TASK_REASONING,
        text: input.text.trim(),
      },
    });

    for (const scope of copyScopes) {
      await prisma.task.create({
        data: {
          includePreviousContext: task.includePreviousContext,
          metadata: buildProjectTaskMetadata({
            instructionSetId: scope.instructionSetId,
            instructionSetName: scope.instructionSetName,
            sourceInstructionTask: {
              id: task.id,
              sourceInstructionSetId: task.instructionSetId,
              sourceInstructionSetName: sourceSetName,
            },
          }),
          model: task.model,
          paused: false,
          previousContextMessages: task.previousContextMessages,
          priority: await getNextTaskPriority(scope.projectId, scope.subprojectId),
          projectId: scope.projectId,
          reasoning: task.reasoning,
          status: "created",
          subprojectId: scope.subprojectId,
          text: task.text,
        },
      });
    }

    createdTasks.push(toInstructionTaskEntity(task));
  }

  publishAppSync("instructions.task_created");
  return createdTasks[0]!;
}

export async function updateInstructionTask(
  instructionTaskId: string,
  input: Partial<{
    includePreviousContext: boolean;
    model: string;
    paused: boolean;
    previousContextMessages: number;
    reasoning: string;
    text: string;
  }>,
): Promise<InstructionTaskEntity> {
  const task = await prisma.skillTask.update({
    data: {
      includePreviousContext: input.includePreviousContext,
      model: input.model?.trim(),
      paused: input.paused,
      previousContextMessages: input.previousContextMessages,
      reasoning: input.reasoning?.trim(),
      text: input.text?.trim(),
    },
    where: { id: instructionTaskId },
  });

  const taskLinks = await listProjectTasksLinkedToInstructionTask(
    task.instructionSetId,
    task.id,
  );
  const syncTargets = taskLinks.filter(
    (link) =>
      shouldSyncFromSkillTask(link.metadata) &&
      !link.editLocked &&
      link.status !== TaskStatus.in_progress,
  );

  for (const syncTarget of syncTargets) {
    await prisma.task.update({
      data: {
        includePreviousContext: task.includePreviousContext,
        model: task.model,
        metadata: buildProjectTaskMetadataForUpdate(syncTarget, task.id),
        previousContextMessages: task.previousContextMessages,
        reasoning: task.reasoning,
        text: task.text,
      },
      where: { id: syncTarget.id },
    });
  }

  publishAppSync("instructions.task_updated");
  return toInstructionTaskEntity(task);
}

export async function deleteInstructionTask(instructionTaskId: string): Promise<void> {
  const existingTask = await prisma.skillTask.findUnique({
    select: { id: true, instructionSetId: true },
    where: { id: instructionTaskId },
  });

  if (!existingTask) {
    return;
  }

  await prisma.skillTask.delete({
    where: { id: instructionTaskId },
  });

  const taskLinks = await listProjectTasksLinkedToInstructionTask(
    existingTask.instructionSetId,
    existingTask.id,
  );

  const removeTargets = taskLinks.filter(
    (link) =>
      shouldSyncFromSkillTask(link.metadata) &&
      !link.editLocked &&
      link.status !== TaskStatus.in_progress,
  );
  const removeIds = removeTargets.map((link) => link.id);

  if (removeIds.length > 0) {
    await prisma.task.deleteMany({
      where: {
        id: {
          in: removeIds,
        },
      },
    });
  }

  publishAppSync("instructions.task_deleted");
}

export async function reorderInstructionTasks(
  instructionSetId: string,
  orderedIds: string[],
): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((instructionTaskId, index) =>
      prisma.skillTask.update({
        data: { priority: index },
        where: {
          id: instructionTaskId,
          instructionSetId,
        },
      }),
    ),
  );

  const sets = await listInstructionSetsTree();
  const affectedComposerIds = collectInstructionSetComposersForSourceSet(
    sets,
    instructionSetId,
  );
  const resolvedTasksByComposer = new Map<string, string[]>(
    affectedComposerIds.map((composerSetId) => [
      composerSetId,
      resolveSkillSetTasks(sets, composerSetId).map((task) => task.id),
    ]),
  );

  const affectedSourceTaskIds = new Set<string>();
  for (const resolvedTaskIds of resolvedTasksByComposer.values()) {
    for (const taskId of resolvedTaskIds) {
      affectedSourceTaskIds.add(taskId);
    }
  }

  if (affectedSourceTaskIds.size > 0 && affectedComposerIds.length > 0) {
    const taskRows = await prisma.task.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      select: {
        createdAt: true,
        id: true,
        metadata: true,
        projectId: true,
        priority: true,
        subprojectId: true,
      },
      where: {
        metadata: { not: Prisma.JsonNull },
      },
    });

    const affectedTaskRows = taskRows.filter((row) => {
      const metadata = parseSkillTaskMetadata(row.metadata);
      return (
        metadata !== null &&
        shouldSyncFromSkillTask(metadata) &&
        resolvedTasksByComposer.has(metadata.instructionSetId) &&
        affectedSourceTaskIds.has(metadata.instructionTaskId)
      );
    });

    const rowsByScope = new Map<string, ProjectInstructionTaskRow[]>();
    for (const row of affectedTaskRows) {
      const metadata = parseSkillTaskMetadata(row.metadata);
      if (!metadata) {
        continue;
      }

      const scopeKey = `${metadata.instructionSetId}|${row.projectId}|${row.subprojectId ?? "null"}`;
      const existingRows = rowsByScope.get(scopeKey);
      if (existingRows) {
        existingRows.push({
          createdAt: row.createdAt,
          id: row.id,
          metadata: row.metadata,
          projectId: row.projectId,
          priority: row.priority,
          subprojectId: row.subprojectId,
        });
      } else {
        rowsByScope.set(scopeKey, [
          {
            createdAt: row.createdAt,
            id: row.id,
            metadata: row.metadata,
            projectId: row.projectId,
            priority: row.priority,
            subprojectId: row.subprojectId,
          },
        ]);
      }
    }

    const reorderedTaskUpdates: Array<{ id: string; priority: number }> = [];
    for (const [scopeKey, rows] of rowsByScope.entries()) {
      const composerSetId = scopeKey.split("|", 3)[0];
      const resolvedTaskIds = resolvedTasksByComposer.get(composerSetId);
      if (!resolvedTaskIds) {
        continue;
      }
      reorderedTaskUpdates.push(
        ...applyInstructionTaskPriorityReorder(composerSetId, rows, resolvedTaskIds),
      );
    }

    if (reorderedTaskUpdates.length > 0) {
      await prisma.$transaction(
        reorderedTaskUpdates.map((update) =>
          prisma.task.update({
            data: { priority: update.priority },
            where: { id: update.id },
          }),
        ),
      );
    }
  }

  publishAppSync("instructions.task_reordered");
}

export async function setInstructionTaskAction(
  instructionTaskId: string,
  action: "pause" | "remove" | "resume",
): Promise<void> {
  if (action === "remove") {
    await deleteInstructionTask(instructionTaskId);
    return;
  }

  if (action === "pause") {
    await prisma.skillTask.update({
      data: { paused: true },
      where: { id: instructionTaskId },
    });
    publishAppSync("instructions.task_paused");
    return;
  }

  await prisma.skillTask.update({
    data: { paused: false },
    where: { id: instructionTaskId },
  });
  publishAppSync("instructions.task_resumed");
}

export {
  createInstructionSet as createSkillSet,
  createInstructionTask as createSkillSetTask,
  deleteInstructionSet as deleteSkillSet,
  deleteInstructionTask as deleteSkillSetTask,
  getInstructionSetById as getSkillSetById,
  listInstructionSetsTree as listSkillSetTree,
  listInstructionSetsTree as listSkillSetsTree,
  reorderInstructionSets as reorderSkillSets,
  reorderInstructionTasks as reorderSkillSetTasks,
  setInstructionSetImagePath as setSkillSetImagePath,
  getInstructionSetImageInfoById as getSkillSetImageInfoById,
  setInstructionTaskAction as setSkillTaskAction,
  setInstructionTaskAction as setSkillSetTaskAction,
  updateInstructionSet as updateSkillSet,
  updateInstructionTask as updateSkillSetTask,
};
