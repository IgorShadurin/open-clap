import type { DaemonApiClient, DaemonCodexUsageState } from "./api-client";
import type { LogStatus } from "./logger";
import { DAEMON_RETRY_POLICY, retryAsync } from "./retry";
import type { WaitFunction } from "./retry";

export const FIVE_HOUR_MIN_REMAINING_PERCENT = 2;
export const SPARK_FALLBACK_MODEL = "gpt-5.3-codex";
export const SPARK_FALLBACK_REASONING = "medium";

const MODEL_USAGE_CANONICAL_ALIASES: Readonly<Record<string, string>> = {
  "codex-bengalfox": "gpt-5.3-codex-spark",
  default: "gpt-5.3-codex",
};

interface LoggerLike {
  log: (status: LogStatus, message: string) => void;
}

export interface FiveHourUsageRetryOptions {
  attempts?: number;
  delayMs?: number;
  wait?: WaitFunction;
}

export interface FiveHourUsageGate {
  allowClaiming: boolean;
  disallowedModels: string[];
}

export interface SparkFallbackResolution {
  fallbackFromModel?: string;
  fallbackFromReasoning?: string;
  model: string;
  reasoning: string;
}

function computeRemainingFiveHourPercent(usage: {
  fiveHourUsedPercent?: number;
}): number | null {
  const usedPercent = usage.fiveHourUsedPercent;
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return null;
  }

  return Math.max(0, Math.min(100, 100 - usedPercent));
}

export function toCanonicalModelIdentifier(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const canonical = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  if (!canonical) {
    return "";
  }

  return MODEL_USAGE_CANONICAL_ALIASES[canonical] ?? canonical;
}

export function isSparkModelIdentifier(modelId: string): boolean {
  return modelId.includes("spark");
}

function buildModelRemainingPercentMap(
  usage: DaemonCodexUsageState | null,
): Map<string, number> {
  const remainingByModel = new Map<string, number>();
  if (!usage?.models || usage.models.length < 1) {
    return remainingByModel;
  }

  for (const summary of usage.models) {
    const modelId = toCanonicalModelIdentifier(summary.model);
    if (!modelId) {
      continue;
    }
    const remainingPercent = computeRemainingFiveHourPercent(summary);
    if (remainingPercent === null) {
      continue;
    }
    remainingByModel.set(modelId, remainingPercent);
  }

  return remainingByModel;
}

function resolveFallbackModelRemainingPercent(
  remainingByModel: Map<string, number>,
): number | undefined {
  return remainingByModel.get(SPARK_FALLBACK_MODEL);
}

function resolveRetryPolicy(retryOptions: FiveHourUsageRetryOptions): {
  attempts: number;
  delayMs: number;
} {
  const attempts = Number.isFinite(retryOptions.attempts)
    ? Math.max(1, Math.floor(retryOptions.attempts ?? 1))
    : DAEMON_RETRY_POLICY.attempts;
  const delayMs = Number.isFinite(retryOptions.delayMs)
    ? Math.max(0, Math.floor(retryOptions.delayMs ?? 0))
    : DAEMON_RETRY_POLICY.delayMs;
  return { attempts, delayMs };
}

export async function fetchFiveHourUsageStateWithRetry(
  apiClient: DaemonApiClient,
  retryOptions: FiveHourUsageRetryOptions = {},
): Promise<DaemonCodexUsageState> {
  const { attempts, delayMs } = resolveRetryPolicy(retryOptions);
  return retryAsync(async () => {
    let fetchedUsage: DaemonCodexUsageState | null;
    try {
      fetchedUsage = await apiClient.fetchCodexUsageState();
    } catch {
      throw new Error("metrics_fetch_failed");
    }
    if (!fetchedUsage) {
      throw new Error("metrics_unavailable");
    }

    const remainingPercent = computeRemainingFiveHourPercent(fetchedUsage);
    if (remainingPercent === null) {
      throw new Error("metrics_invalid");
    }

    return fetchedUsage;
  }, {
    attempts,
    delayMs,
    wait: retryOptions.wait,
  });
}

export function resolveSparkTaskExecutionModel(
  model: string,
  reasoning: string,
  usage: DaemonCodexUsageState | null,
): SparkFallbackResolution {
  const originalModel = model.trim();
  const originalReasoning = reasoning.trim();
  const normalizedTaskModel = toCanonicalModelIdentifier(originalModel);
  if (!isSparkModelIdentifier(normalizedTaskModel)) {
    return {
      model: originalModel,
      reasoning: originalReasoning,
    };
  }

  const remainingByModel = buildModelRemainingPercentMap(usage);
  const sparkRemainingPercent = remainingByModel.get(normalizedTaskModel);
  if (
    sparkRemainingPercent === undefined ||
    sparkRemainingPercent >= FIVE_HOUR_MIN_REMAINING_PERCENT
  ) {
    return {
      model: originalModel,
      reasoning: originalReasoning,
    };
  }

  const codexRemainingPercent = resolveFallbackModelRemainingPercent(remainingByModel);
  if (
    codexRemainingPercent === undefined ||
    codexRemainingPercent < FIVE_HOUR_MIN_REMAINING_PERCENT
  ) {
    return {
      model: originalModel,
      reasoning: originalReasoning,
    };
  }

  return {
    fallbackFromModel: originalModel,
    fallbackFromReasoning: originalReasoning,
    model: SPARK_FALLBACK_MODEL,
    reasoning: SPARK_FALLBACK_REASONING,
  };
}

function collectDisallowedModelsFromUsage(usage: DaemonCodexUsageState): string[] {
  if (!Array.isArray(usage.models) || usage.models.length < 1) {
    return [];
  }

  const remainingByModel = buildModelRemainingPercentMap(usage);
  const codexRemainingPercent = resolveFallbackModelRemainingPercent(remainingByModel);
  const canFallbackSparkToCodex = codexRemainingPercent !== undefined &&
    codexRemainingPercent >= FIVE_HOUR_MIN_REMAINING_PERCENT;

  const disallowed = new Set<string>();
  for (const [modelId, remainingPercent] of remainingByModel.entries()) {
    if (remainingPercent >= FIVE_HOUR_MIN_REMAINING_PERCENT) {
      continue;
    }
    if (isSparkModelIdentifier(modelId) && canFallbackSparkToCodex) {
      continue;
    }
    disallowed.add(modelId);
  }

  return [...disallowed];
}

export async function shouldAllowExecutionBasedOnFiveHourUsage(
  apiClient: DaemonApiClient,
  logger: LoggerLike,
  retryOptions: FiveHourUsageRetryOptions = {},
): Promise<FiveHourUsageGate> {
  const { attempts } = resolveRetryPolicy(retryOptions);

  try {
    const usage = await fetchFiveHourUsageStateWithRetry(apiClient, retryOptions);
    const remainingPercent = computeRemainingFiveHourPercent(usage);
    if (remainingPercent === null) {
      logger.log(
        "waiting",
        `Execution paused: 5h usage values are invalid after ${attempts} attempts`,
      );
      return { allowClaiming: false, disallowedModels: [] };
    }

    const disallowedModels = collectDisallowedModelsFromUsage(usage);
    const modelCount = usage.models?.length ?? 0;
    if (disallowedModels.length > 0 && modelCount > 0 && disallowedModels.length >= modelCount) {
      logger.log(
        "waiting",
        "Execution paused: 5h model limits are below 2% for all available models",
      );
      return {
        allowClaiming: false,
        disallowedModels,
      };
    }

    if (modelCount < 1 && remainingPercent < FIVE_HOUR_MIN_REMAINING_PERCENT) {
      logger.log(
        "waiting",
        `Execution paused: 5h limit remaining ${remainingPercent.toFixed(1)}%`,
      );
      return { allowClaiming: false, disallowedModels: [] };
    }

    return {
      allowClaiming: true,
      disallowedModels,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason === "metrics_invalid") {
      logger.log(
        "waiting",
        `Execution paused: 5h usage values are invalid after ${attempts} attempts`,
      );
      return { allowClaiming: false, disallowedModels: [] };
    }
    if (reason === "metrics_fetch_failed") {
      logger.log(
        "waiting",
        `Execution paused: 5h usage check failed after ${attempts} attempts`,
      );
      return { allowClaiming: false, disallowedModels: [] };
    }
    logger.log(
      "waiting",
      `Execution paused: 5h usage metrics unavailable after ${attempts} attempts`,
    );
    return { allowClaiming: false, disallowedModels: [] };
  }
}
