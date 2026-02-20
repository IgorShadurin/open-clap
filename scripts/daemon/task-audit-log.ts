import fs from "node:fs";
import path from "node:path";

export type TaskAuditStatus =
  | "meta"
  | "task"
  | "command"
  | "output"
  | "success"
  | "failure"
  | "stopped";

const STATUS_EMOJI: Record<TaskAuditStatus, string> = {
  meta: "ℹ️",
  task: "🧩",
  command: "💻",
  output: "📤",
  success: "✅",
  failure: "❌",
  stopped: "🛑",
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatTimestamp(at: Date): string {
  return `[${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}]`;
}

function toAbsolutePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.resolve(process.cwd(), filePath);
}

export function resolveDaemonLogFilePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.DAEMON_LOG_FILE?.trim();
  if (fromEnv) {
    return toAbsolutePath(fromEnv);
  }

  return path.resolve(process.cwd(), "logs", "daemon", "daemon.log");
}

function serializePayload(payload: unknown): string {
  if (payload === undefined) {
    return "";
  }

  try {
    return ` ${JSON.stringify(payload)}`;
  } catch {
    return ` ${String(payload)}`;
  }
}

export interface TaskAuditLogger {
  filePath: string;
  log(status: TaskAuditStatus, message: string, payload?: unknown, at?: Date): void;
}

export function createTaskAuditLogger(filePath: string): TaskAuditLogger {
  const absolutePath = toAbsolutePath(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  return {
    filePath: absolutePath,
    log(status: TaskAuditStatus, message: string, payload?: unknown, at = new Date()): void {
      const line = `${formatTimestamp(at)} ${STATUS_EMOJI[status]} ${message}${serializePayload(payload)}\n`;
      fs.appendFileSync(absolutePath, line, "utf8");
    },
  };
}
