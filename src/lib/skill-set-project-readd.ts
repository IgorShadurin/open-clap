import { Prisma, TaskStatus } from "@prisma/client";

import type { SkillSetProjectReAddResult } from "../../shared/contracts";
import { publishAppSync } from "./live-sync";
import { assertTaskTextListReferencesExist } from "./lists-service";
import { prisma } from "./prisma";
import {
  buildMetadataForResolvedSkillTask,
  parseSkillTaskMetadata,
  resolveSkillSetTasks,
} from "./skill-set-links";
import { listInstructionSetsTree } from "./skills-service";

interface ReAddSkillSetTasksToProjectInput {
  instructionSetId: string;
  projectId: string;
  subprojectId?: string | null;
}

export async function reAddSkillSetTasksToProject(
  input: ReAddSkillSetTasksToProjectInput,
): Promise<SkillSetProjectReAddResult> {
  const instructionSetId = input.instructionSetId.trim();
  if (!instructionSetId) {
    throw new Error("Instruction set id is required");
  }

  const projectId = input.projectId.trim();
  if (!projectId) {
    throw new Error("Project id is required");
  }

  const normalizedSubprojectId =
    typeof input.subprojectId === "string" && input.subprojectId.trim().length > 0
      ? input.subprojectId.trim()
      : null;

  const project = await prisma.project.findUnique({
    select: { id: true },
    where: { id: projectId },
  });
  if (!project) {
    throw new Error("Project not found");
  }

  if (normalizedSubprojectId !== null) {
    const subproject = await prisma.subproject.findUnique({
      select: { projectId: true },
      where: { id: normalizedSubprojectId },
    });
    if (!subproject || subproject.projectId !== projectId) {
      throw new Error("Subproject not found");
    }
  }

  const instructionSets = await listInstructionSetsTree();
  const sourceInstructionSet = instructionSets.find((set) => set.id === instructionSetId);
  if (!sourceInstructionSet) {
    throw new Error("Skill set not found");
  }

  const resolvedTasks = resolveSkillSetTasks(instructionSets, instructionSetId);
  if (resolvedTasks.length < 1) {
    throw new Error("Selected skill set has no tasks to add.");
  }

  for (const task of resolvedTasks) {
    await assertTaskTextListReferencesExist(task.text);
  }

  const instructionSetName = sourceInstructionSet.name.trim() || instructionSetId;

  const existingSkillSetTasks = await prisma.task.findMany({
    select: {
      editLocked: true,
      id: true,
      metadata: true,
      status: true,
    },
    where: {
      metadata: { not: Prisma.JsonNull },
      projectId,
    },
  });

  const tasksToReplace = existingSkillSetTasks.filter((task) => {
    const metadata = parseSkillTaskMetadata(task.metadata);
    return metadata?.instructionSetId === instructionSetId;
  });

  const lockedTaskExists = tasksToReplace.some(
    (task) => task.editLocked || task.status === TaskStatus.in_progress,
  );
  if (lockedTaskExists) {
    throw new Error("Running tasks cannot be edited");
  }

  const removeTaskIds = tasksToReplace.map((task) => task.id);

  await prisma.$transaction(async (tx) => {
    if (removeTaskIds.length > 0) {
      await tx.task.deleteMany({
        where: {
          id: {
            in: removeTaskIds,
          },
        },
      });
    }

    const latestTask = await tx.task.findFirst({
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: { priority: true },
      where: {
        projectId,
        subprojectId: normalizedSubprojectId,
      },
    });

    let priority = latestTask ? latestTask.priority + 1 : 0;

    for (const resolvedTask of resolvedTasks) {
      const metadata = buildMetadataForResolvedSkillTask({
        composerInstructionSetId: instructionSetId,
        composerInstructionSetName: instructionSetName,
        resolvedTask,
      });
      await tx.task.create({
        data: {
          includePreviousContext: resolvedTask.includePreviousContext,
          metadata: JSON.parse(metadata) as Prisma.InputJsonValue,
          model: resolvedTask.model,
          paused: false,
          previousContextMessages: resolvedTask.includePreviousContext
            ? resolvedTask.previousContextMessages
            : 0,
          priority,
          projectId,
          reasoning: resolvedTask.reasoning,
          status: TaskStatus.created,
          subprojectId: normalizedSubprojectId,
          text: resolvedTask.text,
        },
      });
      priority += 1;
    }
  });

  publishAppSync("task.created");

  return {
    createdTaskCount: resolvedTasks.length,
    instructionSetId,
    instructionSetName,
    projectId,
    removedTaskCount: removeTaskIds.length,
    subprojectId: normalizedSubprojectId,
  };
}
