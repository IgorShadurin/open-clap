import type { DaemonTask } from "../contracts/task";

export function getExecutionScopeKey(task: DaemonTask): string {
  const projectId = task.projectId?.trim();
  const subprojectId = task.subprojectId?.trim();

  if (projectId && subprojectId) {
    return `subproject:${projectId}:${subprojectId}`;
  }

  if (projectId) {
    return `project:${projectId}`;
  }

  // Fallback for malformed payloads; keeps scheduler deterministic.
  return `unknown:${task.id}`;
}

function toSortablePriority(task: DaemonTask): number {
  if (typeof task.priority === "number" && Number.isFinite(task.priority)) {
    return task.priority;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function sortTasksByPriority(tasks: DaemonTask[]): DaemonTask[] {
  return tasks
    .map((task, index) => ({ index, task }))
    .sort((left, right) => {
      const priorityDelta =
        toSortablePriority(left.task) - toSortablePriority(right.task);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.task);
}

export function selectParallelTasks(
  tasks: DaemonTask[],
  maxParallel: number,
  activeScopeKeys: Set<string> = new Set(),
): DaemonTask[] {
  if (maxParallel < 1) {
    return [];
  }

  const selected: DaemonTask[] = [];
  const occupiedScopes = new Set(activeScopeKeys);

  for (const task of sortTasksByPriority(tasks)) {
    const scopeKey = getExecutionScopeKey(task);
    if (occupiedScopes.has(scopeKey)) {
      continue;
    }

    selected.push(task);
    occupiedScopes.add(scopeKey);

    if (selected.length >= maxParallel) {
      break;
    }
  }

  return selected;
}
