import { parseSkillTaskMetadata } from "@/lib/skill-set-links";

import type { ProjectTree } from "./content-helpers";

export const SKILL_SET_ALREADY_ADDED_MESSAGE = "Skill set already added to this project";
const SKILL_SET_ALREADY_ADDED_DETAIL = "Instruction set already added to this project scope";

export function isInstructionSetAddedToProject(project: ProjectTree, instructionSetId: string): boolean {
  const normalizedInstructionSetId = instructionSetId.trim();
  if (!normalizedInstructionSetId) {
    return false;
  }

  const allTasks = project.tasks.concat(project.subprojects.flatMap((subproject) => subproject.tasks));
  return allTasks.some((task) => {
    const metadata = parseSkillTaskMetadata(task.metadata);
    return metadata?.instructionSetId === normalizedInstructionSetId;
  });
}

export function getTaskSourceLabelFromMetadata(metadata: string | null | undefined): string | undefined {
  const sourceMetadata = parseSkillTaskMetadata(metadata);
  return sourceMetadata?.instructionSetName;
}

export function getTaskSourceLabel(task: ProjectTree["tasks"][number]): string | undefined {
  return getTaskSourceLabelFromMetadata(task.metadata);
}

export function isInstructionSetAlreadyAddedErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim();
  return (
    normalizedMessage === SKILL_SET_ALREADY_ADDED_MESSAGE ||
    normalizedMessage.includes(SKILL_SET_ALREADY_ADDED_DETAIL)
  );
}
