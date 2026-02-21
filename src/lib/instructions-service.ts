import type { Prisma } from "@prisma/client";

import type {
  InstructionSetEntity,
  InstructionSetTreeItem,
  InstructionTaskEntity,
} from "../../shared/contracts";
import { publishAppSync } from "./live-sync";
import { prisma } from "./prisma";
import { DEFAULT_TASK_MODEL, DEFAULT_TASK_REASONING } from "./task-reasoning";

function toInstructionSetEntity(input: {
  createdAt: Date;
  description: string | null;
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
    id: input.id,
    imagePath: input.imagePath,
    mainPageTasksVisible: input.mainPageTasksVisible,
    name: input.name,
    priority: input.priority,
    updatedAt: input.updatedAt.toISOString(),
  };
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
  const latest = await prisma.instructionSet.findFirst({
    orderBy: [{ priority: "desc" }],
    select: { priority: true },
  });

  return latest ? latest.priority + 1 : 0;
}

async function nextInstructionTaskPriority(instructionSetId: string): Promise<number> {
  const latest = await prisma.instructionTask.findFirst({
    orderBy: [{ priority: "desc" }],
    select: { priority: true },
    where: { instructionSetId },
  });

  return latest ? latest.priority + 1 : 0;
}

export async function listInstructionSetsTree(): Promise<InstructionSetTreeItem[]> {
  const sets = await prisma.instructionSet.findMany({
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
  const set = await prisma.instructionSet.findUnique({
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
  const set = await prisma.instructionSet.findUnique({
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
  const set = await prisma.instructionSet.create({
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
    description: string | null;
    mainPageTasksVisible: boolean;
    name: string;
  }>,
): Promise<InstructionSetEntity> {
  const data: Prisma.InstructionSetUpdateInput = {
    description:
      input.description === undefined ? undefined : input.description?.trim() || null,
    mainPageTasksVisible: input.mainPageTasksVisible,
    name: input.name?.trim(),
  };

  const set = await prisma.instructionSet.update({
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
  const set = await prisma.instructionSet.update({
    data: {
      imagePath,
    },
    where: { id: instructionSetId },
  });

  publishAppSync("instructions.updated");
  return toInstructionSetEntity(set);
}

export async function deleteInstructionSet(instructionSetId: string): Promise<void> {
  await prisma.instructionSet.delete({
    where: { id: instructionSetId },
  });
  publishAppSync("instructions.deleted");
}

export async function reorderInstructionSets(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((instructionSetId, index) =>
      prisma.instructionSet.update({
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
  previousContextMessages?: number;
  reasoning?: string;
  text: string;
}): Promise<InstructionTaskEntity> {
  const priority = await nextInstructionTaskPriority(input.instructionSetId);
  const task = await prisma.instructionTask.create({
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

  publishAppSync("instructions.task_created");
  return toInstructionTaskEntity(task);
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
  const task = await prisma.instructionTask.update({
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

  publishAppSync("instructions.task_updated");
  return toInstructionTaskEntity(task);
}

export async function deleteInstructionTask(instructionTaskId: string): Promise<void> {
  await prisma.instructionTask.delete({
    where: { id: instructionTaskId },
  });

  publishAppSync("instructions.task_deleted");
}

export async function reorderInstructionTasks(
  instructionSetId: string,
  orderedIds: string[],
): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((instructionTaskId, index) =>
      prisma.instructionTask.update({
        data: { priority: index },
        where: {
          id: instructionTaskId,
          instructionSetId,
        },
      }),
    ),
  );

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
    await prisma.instructionTask.update({
      data: { paused: true },
      where: { id: instructionTaskId },
    });
    publishAppSync("instructions.task_paused");
    return;
  }

  await prisma.instructionTask.update({
    data: { paused: false },
    where: { id: instructionTaskId },
  });
  publishAppSync("instructions.task_resumed");
}
