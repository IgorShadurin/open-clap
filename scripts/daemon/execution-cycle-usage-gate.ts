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

interface ModelLimitState {
  allowed: boolean;
  fiveHourRemainingPercent: number | null;
  weeklyRemainingPercent: number | null;
}

function computeRemainingPercent(usedPercent: number | null | undefined): number | null {
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return null;
  }

  return Math.max(0, Math.min(100, 100 - usedPercent));
}

function computeRemainingFiveHourPercent(usage: {
  fiveHourUsedPercent?: number;
}): number | null {
  return computeRemainingPercent(usage.fiveHourUsedPercent);
}

function computeRemainingWeeklyPercent(usage: {
  weeklyUsedPercent?: number | null;
}): number | null {
  return computeRemainingPercent(usage.weeklyUsedPercent);
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

function mergeModelLimitState(previous: ModelLimitState, next: ModelLimitState): ModelLimitState {
  const chooseLower = (a: number | null, b: number | null): number | null => {
    if (a === null) {
      return b;
    }
    if (b === null) {
      return a;
    }
    return Math.min(a, b);
  };

  return {
    allowed: previous.allowed && next.allowed,
    fiveHourRemainingPercent: chooseLower(
      previous.fiveHourRemainingPercent,
      next.fiveHourRemainingPercent,
    ),
    weeklyRemainingPercent: chooseLower(
      previous.weeklyRemainingPercent,
      next.weeklyRemainingPercent,
    ),
  };
}

function buildModelLimitStateMap(
  usage: DaemonCodexUsageState | null,
): Map<string, ModelLimitState> {
  const limitsByModel = new Map<string, ModelLimitState>();
  if (!usage?.models || usage.models.length < 1) {
    return limitsByModel;
  }

  for (const summary of usage.models) {
    const modelId = toCanonicalModelIdentifier(summary.model);
    if (!modelId) {
      continue;
    }

    const nextState: ModelLimitState = {
      allowed: summary.allowed !== false,
      fiveHourRemainingPercent: computeRemainingFiveHourPercent(summary),
      weeklyRemainingPercent: computeRemainingWeeklyPercent(summary),
    };
    const previousState = limitsByModel.get(modelId);
    if (previousState) {
      limitsByModel.set(modelId, mergeModelLimitState(previousState, nextState));
      continue;
    }
    limitsByModel.set(modelId, nextState);
  }

  return limitsByModel;
}

function countKnownModels(usage: DaemonCodexUsageState | null): number {
  if (!Array.isArray(usage?.models)) {
    return 0;
  }

  const modelSet = new Set<string>();
  for (const summary of usage.models) {
    const modelId = toCanonicalModelIdentifier(summary.model);
    if (modelId) {
      modelSet.add(modelId);
    }
  }

  return modelSet.size;
}

function resolveFallbackModelLimitState(
  limitsByModel: Map<string, ModelLimitState>,
): ModelLimitState | undefined {
  return limitsByModel.get(SPARK_FALLBACK_MODEL);
}

function isBelowRemainingThreshold(remainingPercent: number | null): boolean {
  return remainingPercent !== null && remainingPercent < FIVE_HOUR_MIN_REMAINING_PERCENT;
}

function isModelExecutionBlocked(limitState: ModelLimitState): boolean {
  if (!limitState.allowed) {
    return true;
  }

  return (
    isBelowRemainingThreshold(limitState.fiveHourRemainingPercent) ||
    isBelowRemainingThreshold(limitState.weeklyRemainingPercent)
  );
}

function canExecuteWithCurrentLimitState(limitState: ModelLimitState | undefined): boolean {
  if (!limitState || !limitState.allowed) {
    return false;
  }

  return (
    !isBelowRemainingThreshold(limitState.fiveHourRemainingPercent) &&
    !isBelowRemainingThreshold(limitState.weeklyRemainingPercent)
  );
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

  const limitsByModel = buildModelLimitStateMap(usage);
  const sparkLimitState = limitsByModel.get(normalizedTaskModel);
  if (!sparkLimitState || !isModelExecutionBlocked(sparkLimitState)) {
    return {
      model: originalModel,
      reasoning: originalReasoning,
    };
  }

  const codexLimitState = resolveFallbackModelLimitState(limitsByModel);
  if (!canExecuteWithCurrentLimitState(codexLimitState)) {
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

  const limitsByModel = buildModelLimitStateMap(usage);
  const canFallbackSparkToCodex = canExecuteWithCurrentLimitState(
    resolveFallbackModelLimitState(limitsByModel),
  );

  const disallowed = new Set<string>();
  for (const [modelId, limitState] of limitsByModel.entries()) {
    if (!isModelExecutionBlocked(limitState)) {
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
    const fiveHourRemainingPercent = computeRemainingFiveHourPercent(usage);
    if (fiveHourRemainingPercent === null) {
      logger.log(
        "waiting",
        `Execution paused: 5h usage values are invalid after ${attempts} attempts`,
      );
      return { allowClaiming: false, disallowedModels: [] };
    }
    if (usage.allowed === false) {
      logger.log(
        "waiting",
        "Execution paused: Codex usage reports limits exhausted or unavailable allowance",
      );
      return { allowClaiming: false, disallowedModels: [] };
    }

    const weeklyRemainingPercent = computeRemainingWeeklyPercent(usage);

    const disallowedModels = collectDisallowedModelsFromUsage(usage);
    const modelCount = countKnownModels(usage);
    if (disallowedModels.length > 0 && modelCount > 0 && disallowedModels.length >= modelCount) {
      logger.log(
        "waiting",
        "Execution paused: model limits are below 2% or blocked for all available models",
      );
      return {
        allowClaiming: false,
        disallowedModels,
      };
    }

    if (modelCount < 1 && fiveHourRemainingPercent < FIVE_HOUR_MIN_REMAINING_PERCENT) {
      logger.log(
        "waiting",
        `Execution paused: 5h limit remaining ${fiveHourRemainingPercent.toFixed(1)}%`,
      );
      return { allowClaiming: false, disallowedModels: [] };
    }
    if (
      modelCount < 1 &&
      weeklyRemainingPercent !== null &&
      weeklyRemainingPercent < FIVE_HOUR_MIN_REMAINING_PERCENT
    ) {
      logger.log(
        "waiting",
        `Execution paused: weekly limit remaining ${weeklyRemainingPercent.toFixed(1)}%`,
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
