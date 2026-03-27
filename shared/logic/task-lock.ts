import type { TaskEntityStatus } from "../contracts/entities";

export interface TaskExecutionLockLike {
  editLocked: boolean;
  status: TaskEntityStatus | "in_progress";
}

export function isTaskExecutionLocked(task: TaskExecutionLockLike): boolean {
  return task.editLocked || task.status === "in_progress";
}

export function canEditTaskEntity(task: TaskExecutionLockLike): boolean {
  return !isTaskExecutionLocked(task);
}
