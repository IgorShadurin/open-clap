import type { Prisma } from "@prisma/client";

import type { SkillSetTreeItem } from "../../shared/contracts";

const SKILL_TASK_METADATA_KIND = "instruction-task";

export interface SkillTaskLinkMetadata {
  kind: typeof SKILL_TASK_METADATA_KIND;
  instructionSetId: string;
  instructionSetName: string;
  instructionTaskId: string;
  sourceInstructionSetId: string;
  sourceInstructionSetName: string;
  isManuallyEdited?: boolean;
}

export interface ResolvedSkillTask {
  id: string;
  includePreviousContext: boolean;
  model: string;
  previousContextMessages: number;
  reasoning: string;
  text: string;
  sourceInstructionSetId: string;
  sourceInstructionSetName: string;
}

function normalizeInstructionSetId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInstructionSetName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseRawInstructionTaskMetadata(rawMetadata: unknown): unknown {
  if (rawMetadata == null) {
    return null;
  }

  if (typeof rawMetadata === "string") {
    try {
      return JSON.parse(rawMetadata) as unknown;
    } catch {
      return null;
    }
  }

  if (typeof rawMetadata === "object") {
    return rawMetadata;
  }

  return null;
}

export function buildSkillTaskMetadata(input: {
  instructionSetId: string;
  instructionSetName: string;
  instructionTaskId: string;
  sourceInstructionSetId: string;
  sourceInstructionSetName: string;
  isManuallyEdited?: boolean;
}): string {
  const instructionSetId = normalizeInstructionSetId(input.instructionSetId);
  const instructionSetName = normalizeInstructionSetName(input.instructionSetName);
  const instructionTaskId = normalizeInstructionSetId(input.instructionTaskId);
  const sourceInstructionSetId = normalizeInstructionSetId(input.sourceInstructionSetId);
  const sourceInstructionSetName = normalizeInstructionSetName(input.sourceInstructionSetName);

  if (
    !instructionSetId ||
    !instructionSetName ||
    !instructionTaskId ||
    !sourceInstructionSetId ||
    !sourceInstructionSetName
  ) {
    throw new Error("Invalid instruction task metadata payload");
  }

  return JSON.stringify({
    kind: SKILL_TASK_METADATA_KIND,
    instructionSetId,
    instructionSetName,
    instructionTaskId,
    sourceInstructionSetId,
    sourceInstructionSetName,
    isManuallyEdited: Boolean(input.isManuallyEdited),
  });
}

function asSkillTaskLinkMetadata(raw: unknown): SkillTaskLinkMetadata | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Partial<{
    kind: string;
    instructionSetId: unknown;
    instructionSetName: unknown;
    instructionTaskId: unknown;
    sourceInstructionSetId: unknown;
    sourceInstructionSetName: unknown;
    isManuallyEdited: unknown;
  }>;

  const hasBaseFields =
    typeof data.instructionSetId === "string" &&
    typeof data.instructionTaskId === "string";

  if (data.kind !== SKILL_TASK_METADATA_KIND && !hasBaseFields) {
    return null;
  }

  const instructionSetId = normalizeInstructionSetId(data.instructionSetId);
  const instructionSetName = normalizeInstructionSetName(data.instructionSetName) || instructionSetId;
  const instructionTaskId = normalizeInstructionSetId(data.instructionTaskId);

  if (!instructionSetId || !instructionSetName || !instructionTaskId) {
    return null;
  }

  const fallbackSourceInstructionSetId =
    normalizeInstructionSetId(data.sourceInstructionSetId) || instructionSetId;
  const sourceInstructionSetName =
    normalizeInstructionSetName(data.sourceInstructionSetName) || instructionSetName;
  const isManuallyEdited = normalizeBoolean(data.isManuallyEdited);

  return {
    kind: SKILL_TASK_METADATA_KIND,
    instructionSetId,
    instructionSetName,
    instructionTaskId,
    sourceInstructionSetId: fallbackSourceInstructionSetId,
    sourceInstructionSetName,
    isManuallyEdited,
  };
}

export function parseSkillTaskMetadata(
  rawMetadata: string | Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
): SkillTaskLinkMetadata | null {
  return asSkillTaskLinkMetadata(parseRawInstructionTaskMetadata(rawMetadata));
}

export function markSkillTaskMetadataEdited(
  metadata: SkillTaskLinkMetadata,
  isManuallyEdited: boolean,
): string {
  return buildSkillTaskMetadata({
    instructionSetId: metadata.instructionSetId,
    instructionSetName: metadata.instructionSetName,
    instructionTaskId: metadata.instructionTaskId,
    sourceInstructionSetId: metadata.sourceInstructionSetId,
    sourceInstructionSetName: metadata.sourceInstructionSetName,
    isManuallyEdited,
  });
}

export function buildMetadataForResolvedSkillTask(input: {
  composerInstructionSetId: string;
  composerInstructionSetName: string;
  resolvedTask: ResolvedSkillTask;
}): string {
  return buildSkillTaskMetadata({
    instructionSetId: input.composerInstructionSetId,
    instructionSetName: input.composerInstructionSetName,
    instructionTaskId: input.resolvedTask.id,
    sourceInstructionSetId: input.resolvedTask.sourceInstructionSetId,
    sourceInstructionSetName: input.resolvedTask.sourceInstructionSetName,
    isManuallyEdited: false,
  });
}

export function parseSourceSkillSetId(rawMetadata: string | Prisma.JsonValue | null | undefined): string {
  const metadata = parseSkillTaskMetadata(rawMetadata);
  return metadata?.sourceInstructionSetId ?? "";
}

export function shouldSyncFromSkillTask(metadata: SkillTaskLinkMetadata): boolean {
  return metadata.kind === SKILL_TASK_METADATA_KIND && metadata.isManuallyEdited !== true;
}

export function resolveSkillSetTasks(
  instructionSets: readonly SkillSetTreeItem[],
  instructionSetId: string,
): ResolvedSkillTask[] {
  const rootSetId = instructionSetId.trim();
  if (!rootSetId) {
    return [];
  }

  const setById = new Map(
    instructionSets.map((instructionSet) => [instructionSet.id, instructionSet] as const),
  );
  const resolved: ResolvedSkillTask[] = [];
  const visited = new Set<string>();

  const walk = (setId: string) => {
    if (visited.has(setId)) {
      return;
    }

    const instructionSet = setById.get(setId);
    if (!instructionSet) {
      return;
    }

    visited.add(setId);
    for (const task of instructionSet.tasks) {
      resolved.push({
        id: task.id,
        includePreviousContext: task.includePreviousContext,
        model: task.model,
        previousContextMessages: task.previousContextMessages,
        reasoning: task.reasoning,
        sourceInstructionSetId: instructionSet.id,
        sourceInstructionSetName: instructionSet.name,
        text: task.text,
      });
    }

    for (const linkedSetId of instructionSet.linkedInstructionSetIds ?? []) {
      walk(linkedSetId);
    }
  };

  walk(rootSetId);
  return resolved;
}

export type InstructionTaskLinkMetadata = SkillTaskLinkMetadata;
export type ResolvedInstructionTask = ResolvedSkillTask;

export {
  buildSkillTaskMetadata as buildInstructionTaskMetadata,
  buildMetadataForResolvedSkillTask as buildMetadataForResolvedInstructionTask,
  parseSkillTaskMetadata as parseInstructionTaskMetadata,
  parseSourceSkillSetId as parseSourceInstructionSetId,
  shouldSyncFromSkillTask as shouldSyncFromInstructionTask,
  resolveSkillSetTasks as resolveInstructionSetTasks,
};
