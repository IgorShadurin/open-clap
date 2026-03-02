import type { DaemonTask } from "../../shared/contracts/task";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const HIGH_REASONING_LEVELS = new Set(["high", "xhigh"]);
const SPARK_MODEL_MARKER = "spark";

export const SPARK_TASK_TIMEOUTS_MS = Object.freeze({
  highReasoning: 10 * MINUTE_MS,
  lowerReasoning: 5 * MINUTE_MS,
});

export const STANDARD_TASK_TIMEOUTS_MS = Object.freeze({
  highReasoning: 30 * MINUTE_MS,
  lowerReasoning: 15 * MINUTE_MS,
});

export function isHighReasoning(reasoning: string): boolean {
  return HIGH_REASONING_LEVELS.has(reasoning.trim().toLowerCase());
}

export function isSparkModel(model: string): boolean {
  return model.trim().toLowerCase().includes(SPARK_MODEL_MARKER);
}

export function resolveTaskExecutionTimeoutMs(task: Pick<DaemonTask, "model" | "reasoning">): number {
  const timeoutGroup = isSparkModel(task.model) ? SPARK_TASK_TIMEOUTS_MS : STANDARD_TASK_TIMEOUTS_MS;
  return isHighReasoning(task.reasoning)
    ? timeoutGroup.highReasoning
    : timeoutGroup.lowerReasoning;
}

export function formatTimeoutDuration(timeoutMs: number): string {
  if (timeoutMs % MINUTE_MS === 0) {
    return `${timeoutMs / MINUTE_MS}m`;
  }
  if (timeoutMs % 1_000 === 0) {
    return `${timeoutMs / 1_000}s`;
  }
  return `${timeoutMs}ms`;
}

export function formatElapsedDuration(durationMs: number): string {
  const safeDurationMs = Number.isFinite(durationMs) && durationMs >= 0
    ? Math.floor(durationMs)
    : 0;

  if (safeDurationMs < 1_000) {
    return `${safeDurationMs}ms`;
  }

  if (safeDurationMs < MINUTE_MS) {
    const seconds = safeDurationMs / 1_000;
    if (seconds < 10) {
      return `${seconds.toFixed(1).replace(/\.0$/, "")}s`;
    }
    return `${Math.round(seconds)}s`;
  }

  if (safeDurationMs < HOUR_MS) {
    const minutes = Math.floor(safeDurationMs / MINUTE_MS);
    const seconds = Math.floor((safeDurationMs % MINUTE_MS) / 1_000);
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(safeDurationMs / HOUR_MS);
  const minutes = Math.floor((safeDurationMs % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((safeDurationMs % MINUTE_MS) / 1_000);
  return `${hours}h ${minutes}m ${seconds}s`;
}
