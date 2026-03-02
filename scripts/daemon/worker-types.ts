import type { TaskAuditLogger } from "./task-audit-log";

export interface ListSubtaskProgressEvent {
  attempts: number;
  current: number;
  durationMs: number;
  itemValue: string | null;
  listId: string;
  status: "done" | "failed";
  taskId: string;
  total: number;
}

export interface CommandTimeoutEvent {
  attempt: number;
  taskId: string;
  timeoutMs: number;
  variantLabel: string;
}

export interface WorkerExecutionContext {
  auditLogger?: TaskAuditLogger;
  codexCommandTemplate?: string;
  commandRunner?: CommandRunner;
  onCommandTimeout?: (event: CommandTimeoutEvent) => void;
  onListSubtaskComplete?: (event: ListSubtaskProgressEvent) => void;
  taskTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface ShellCommandResult {
  code: number;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

export type CommandRunner = (
  command: string,
  options?: { signal?: AbortSignal },
) => Promise<ShellCommandResult>;
