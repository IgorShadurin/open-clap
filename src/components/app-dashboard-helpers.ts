import type { TaskEntity } from "../../shared/contracts";

interface ApiErrorPayload {
  details?: string;
  error?: { code?: string; message?: string };
}

export function buildTaskScopeHref(
  projectId: string,
  subprojectId?: string | null,
): string {
  if (subprojectId) {
    return `/projects/${projectId}/tasks?subprojectId=${encodeURIComponent(subprojectId)}`;
  }

  return `/projects/${projectId}/tasks`;
}

export function canEditTask(task: Pick<TaskEntity, "editLocked" | "status">): boolean {
  return !task.editLocked && task.status !== "in_progress";
}

export function extractApiErrorMessage(
  status: number,
  payload?: ApiErrorPayload,
): string {
  const code = payload?.error?.code?.trim();
  const message = payload?.error?.message?.trim();
  const details = payload?.details?.trim();

  if (message && details) {
    return code ? `[${code}] ${message}: ${details}` : `${message}: ${details}`;
  }

  if (message) {
    return code ? `[${code}] ${message}` : message;
  }

  if (details) {
    return details;
  }

  return `Request failed with status ${status}`;
}

export async function requestJson<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let payload: ApiErrorPayload | undefined;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // no-op
    }
    throw new Error(extractApiErrorMessage(response.status, payload));
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}
