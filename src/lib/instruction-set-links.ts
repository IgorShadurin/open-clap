import type { Prisma } from "@prisma/client";
import type { InstructionSetTreeItem } from "../../shared/contracts";

const INSTRUCTION_TASK_METADATA_KIND = "instruction-task";

export interface InstructionTaskLinkMetadata {
  kind: typeof INSTRUCTION_TASK_METADATA_KIND;
  instructionSetId: string;
  instructionSetName: string;
  instructionTaskId: string;
  sourceInstructionSetId: string;
  sourceInstructionSetName: string;
  isManuallyEdited?: boolean;
}

export interface ResolvedInstructionTask {
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

export function buildInstructionTaskMetadata(input: {
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
    kind: INSTRUCTION_TASK_METADATA_KIND,
    instructionSetId,
    instructionSetName,
    instructionTaskId,
    sourceInstructionSetId,
    sourceInstructionSetName,
    isManuallyEdited: Boolean(input.isManuallyEdited),
  });
}

function asInstructionTaskLinkMetadata(raw: unknown): InstructionTaskLinkMetadata | null {
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

  if (data.kind !== INSTRUCTION_TASK_METADATA_KIND && !hasBaseFields) {
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
    kind: INSTRUCTION_TASK_METADATA_KIND,
    instructionSetId,
    instructionSetName,
    instructionTaskId,
    sourceInstructionSetId: fallbackSourceInstructionSetId,
    sourceInstructionSetName,
    isManuallyEdited,
  };
}

export function parseInstructionTaskMetadata(
  rawMetadata: string | Prisma.JsonValue | null | undefined,
): InstructionTaskLinkMetadata | null {
  return asInstructionTaskLinkMetadata(parseRawInstructionTaskMetadata(rawMetadata));
}

export function markInstructionTaskMetadataEdited(
  metadata: InstructionTaskLinkMetadata,
  isManuallyEdited: boolean,
): string {
  return buildInstructionTaskMetadata({
    instructionSetId: metadata.instructionSetId,
    instructionSetName: metadata.instructionSetName,
    instructionTaskId: metadata.instructionTaskId,
    sourceInstructionSetId: metadata.sourceInstructionSetId,
    sourceInstructionSetName: metadata.sourceInstructionSetName,
    isManuallyEdited,
  });
}

export function buildMetadataForResolvedInstructionTask(input: {
  composerInstructionSetId: string;
  composerInstructionSetName: string;
  resolvedTask: ResolvedInstructionTask;
}): string {
  return buildInstructionTaskMetadata({
    instructionSetId: input.composerInstructionSetId,
    instructionSetName: input.composerInstructionSetName,
    instructionTaskId: input.resolvedTask.id,
    sourceInstructionSetId: input.resolvedTask.sourceInstructionSetId,
    sourceInstructionSetName: input.resolvedTask.sourceInstructionSetName,
    isManuallyEdited: false,
  });
}

export function parseSourceInstructionSetId(rawMetadata: string | Prisma.JsonValue | null | undefined): string {
  const metadata = parseInstructionTaskMetadata(rawMetadata);
  return metadata?.sourceInstructionSetId ?? "";
}

export function shouldSyncFromInstructionTask(
  metadata: InstructionTaskLinkMetadata,
): boolean {
  return metadata.kind === INSTRUCTION_TASK_METADATA_KIND && metadata.isManuallyEdited !== true;
}

export function resolveInstructionSetTasks(
  instructionSets: readonly InstructionSetTreeItem[],
  instructionSetId: string,
): ResolvedInstructionTask[] {
  const rootSetId = instructionSetId.trim();
  if (!rootSetId) {
    return [];
  }

  const setById = new Map(
    instructionSets.map((instructionSet) => [instructionSet.id, instructionSet] as const),
  );
  const resolved: ResolvedInstructionTask[] = [];
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
