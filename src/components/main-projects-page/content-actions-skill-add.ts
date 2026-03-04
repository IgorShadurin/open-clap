"use client";

import {
  buildMetadataForResolvedSkillTask,
  resolveSkillSetTasks,
} from "@/lib/skill-set-links";

import type { SkillSetTreeItem } from "../../../shared/contracts";
import { requestJson } from "../app-dashboard/helpers";

interface AddSkillSetTasksToProjectInput {
  instructionSetId: string;
  instructionSets: SkillSetTreeItem[];
  projectId: string;
  subprojectId?: string | null;
}

export async function addSkillSetTasksToProject(
  input: AddSkillSetTasksToProjectInput,
): Promise<number> {
  const normalizedInstructionSetId = input.instructionSetId.trim();
  if (!normalizedInstructionSetId) {
    return 0;
  }

  const selectedInstructionSet = input.instructionSets.find(
    (instructionSet) => instructionSet.id === normalizedInstructionSetId,
  );
  const resolvedTasks = resolveSkillSetTasks(
    input.instructionSets,
    normalizedInstructionSetId,
  );

  if (resolvedTasks.length < 1) {
    throw new Error("Selected skill set has no tasks to add.");
  }

  let isFirstResolvedTask = true;
  for (const resolvedTask of resolvedTasks) {
    const sourceInstructionSetName =
      selectedInstructionSet?.name?.trim() || resolvedTask.sourceInstructionSetName;
    const payloadMetadata = buildMetadataForResolvedSkillTask({
      composerInstructionSetId: normalizedInstructionSetId,
      composerInstructionSetName: sourceInstructionSetName,
      resolvedTask,
    });

    await requestJson("/api/tasks", {
      body: JSON.stringify({
        includePreviousContext: resolvedTask.includePreviousContext,
        metadata: payloadMetadata,
        model: resolvedTask.model,
        previousContextMessages: resolvedTask.includePreviousContext
          ? resolvedTask.previousContextMessages
          : 0,
        projectId: input.projectId,
        reasoning: resolvedTask.reasoning,
        skipInstructionSetDuplicateCheck: !isFirstResolvedTask,
        subprojectId: input.subprojectId ?? null,
        text: resolvedTask.text,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    isFirstResolvedTask = false;
  }

  return resolvedTasks.length;
}
