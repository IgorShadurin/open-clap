export type LogStatus =
  | "waiting"
  | "done"
  | "failed"
  | "running"
  | "stopped"
  | "info";

const STATUS_EMOJI: Record<LogStatus, string> = {
  waiting: "🕒",
  done: "✅",
  failed: "❌",
  running: "🚀",
  stopped: "🛑",
  info: "ℹ️",
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatTimestamp(input: Date): string {
  return `[${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())} ${pad(input.getHours())}:${pad(input.getMinutes())}:${pad(input.getSeconds())}]`;
}

export function formatLogLine(
  status: LogStatus,
  message: string,
  at = new Date(),
): string {
  return `${formatTimestamp(at)} ${STATUS_EMOJI[status]} ${message}`;
}

export function createLogger(writer: (line: string) => void = console.log) {
  return {
    log(status: LogStatus, message: string, at?: Date): void {
      writer(formatLogLine(status, message, at));
    },
  };
}
