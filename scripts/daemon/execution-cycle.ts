import type { DaemonApiClient } from "./api-client";
import type { RunningTaskControl } from "./immediate-action-handler";
import type { LogStatus } from "./logger";
import { TaskScheduler } from "./scheduler";
import { StatusReporter } from "./status-reporter";
import type { WorkerTemplates } from "./template-renderer";
import type { TaskAuditLogger } from "./task-audit-log";
import type { WorkerExecutionContext } from "./worker-types";
import {
  FIVE_HOUR_MIN_REMAINING_PERCENT,
  fetchFiveHourUsageStateWithRetry,
  isSparkModelIdentifier,
  resolveSparkTaskExecutionModel,
  type FiveHourUsageRetryOptions,
  shouldAllowExecutionBasedOnFiveHourUsage,
  toCanonicalModelIdentifier,
} from "./execution-cycle-usage-gate";
import {
  formatElapsedDuration,
  formatTimeoutDuration,
  resolveTaskExecutionTimeoutMs,
} from "./task-timeout-config";
import type { DaemonTask, TaskExecutionResult } from "../../shared/contracts/task";
import { executeTask } from "./worker";
import { getExecutionScopeKey } from "../../shared/logic/task-priority";
import {
  extractListIdsFromText,
  getTaskListTypeValidationError,
} from "../../src/lib/list-tokens";

interface LoggerLike {
  log: (status: LogStatus, message: string) => void;
}

interface TaskControl extends RunningTaskControl {
  stopped: boolean;
}

interface FallbackExecutionMetadata {
  fromModel: string;
  fromReasoning: string;
  toModel: string;
  toReasoning: string;
}

const MAX_LIST_LOG_ITEM_SYMBOLS = 30;

function formatListItemForLog(itemValue: string | null | undefined): string {
  if (typeof itemValue !== "string") {
    return "n/a";
  }

  const normalized = itemValue.replace(/\s+/g, " ").trim();
  if (normalized.length < 1) {
    return "n/a";
  }

  const symbols = [...normalized];
  if (symbols.length <= MAX_LIST_LOG_ITEM_SYMBOLS) {
    return normalized;
  }

  return `${symbols.slice(0, MAX_LIST_LOG_ITEM_SYMBOLS).join("")}...`;
}

export interface RunTaskExecutionCycleOptions {
  activeWorkers: Map<string, Promise<void>>;
  apiClient: DaemonApiClient;
  logger: LoggerLike;
  runningTasks: Map<string, RunningTaskControl>;
  runningTaskScopeById: Map<string, string>;
  scheduler: TaskScheduler;
  statusReporter: StatusReporter;
  taskAuditLogger?: TaskAuditLogger;
  templates: WorkerTemplates;
  codexCommandTemplate?: string;
  fiveHourUsageRetry?: FiveHourUsageRetryOptions;
  resolveTaskTimeoutMs?: (task: DaemonTask) => number;
  workerExecutor?: (
    task: DaemonTask,
    templates: WorkerTemplates,
    context?: WorkerExecutionContext,
  ) => Promise<TaskExecutionResult>;
}

export interface ExecutionCycleResult {
  fetched: number;
  slotsRequested: number;
  started: number;
}

export async function runTaskExecutionCycle({
  activeWorkers,
  apiClient,
  logger,
  runningTasks,
  runningTaskScopeById,
  scheduler,
  statusReporter,
  taskAuditLogger,
  templates,
  codexCommandTemplate,
  fiveHourUsageRetry,
  resolveTaskTimeoutMs = resolveTaskExecutionTimeoutMs,
  workerExecutor = executeTask,
}: RunTaskExecutionCycleOptions): Promise<ExecutionCycleResult> {
  const slotsRequested = scheduler.availableSlots();
  if (slotsRequested < 1) {
    if (activeWorkers.size < 1 && runningTasks.size < 1) {
      logger.log("waiting", "No free execution slots");
    }
    return { fetched: 0, slotsRequested, started: 0 };
  }

  const fiveHourUsageGate = await shouldAllowExecutionBasedOnFiveHourUsage(
    apiClient,
    logger,
    fiveHourUsageRetry,
  );
  if (!fiveHourUsageGate.allowClaiming) {
    return { fetched: 0, slotsRequested, started: 0 };
  }

  const fetchedTasks = await apiClient.fetchNextTasks(
    slotsRequested,
    fiveHourUsageGate.disallowedModels,
  );
  if (fetchedTasks.length < 1) {
    if (fiveHourUsageGate.disallowedModels.length > 0) {
      logger.log(
        "waiting",
        `No eligible queued tasks without skipping model-limited tasks (5h remaining >= ${FIVE_HOUR_MIN_REMAINING_PERCENT}%)`,
      );
    } else {
      logger.log("waiting", "No queued tasks available");
    }
    return { fetched: 0, slotsRequested, started: 0 };
  }

  const claimedTasks: DaemonTask[] = [];
  for (const task of fetchedTasks) {
    if (!scheduler.startTask(task.id)) {
      continue;
    }
    claimedTasks.push(task);
  }

  if (claimedTasks.length < 1) {
    logger.log("waiting", "Fetched tasks were already active or exceeded capacity");
    return {
      fetched: fetchedTasks.length,
      slotsRequested,
      started: 0,
    };
  }

  await apiClient.markTasksInProgress(claimedTasks.map((task) => task.id));

  let startedCount = 0;
  for (const task of claimedTasks) {
    const referencedListIds = extractListIdsFromText(task.text);
    if (referencedListIds.length > 1) {
      const details =
        getTaskListTypeValidationError(task.text) ??
        "Task can reference only one list type.";
      taskAuditLogger?.log("failure", "Task rejected: multiple list types", {
        listIds: referencedListIds,
        taskId: task.id,
      });
      await statusReporter.report(task.id, "failed", details);
      scheduler.finishTask(task.id);
      logger.log("failed", `Task ${task.id} failed: ${details}`);
      continue;
    }

    if (referencedListIds.length === 1) {
      const listId = referencedListIds[0]!;
      const plannedPromptCount = task.listExecution?.listId === listId
        ? task.listExecution.items.length
        : 0;
      logger.log(
        "running",
        `Task ${task.id} uses $list-${listId}; prompts=${plannedPromptCount}`,
      );
    }

    let executionTask = task;
    let fallbackExecutionMetadata: FallbackExecutionMetadata | null = null;
    const normalizedTaskModel = toCanonicalModelIdentifier(task.model);
    if (isSparkModelIdentifier(normalizedTaskModel)) {
      try {
        const usageForFallbackCheck = await fetchFiveHourUsageStateWithRetry(
          apiClient,
          fiveHourUsageRetry,
        );
        const fallbackResolution = resolveSparkTaskExecutionModel(
          task.model,
          task.reasoning,
          usageForFallbackCheck,
        );
        if (fallbackResolution.fallbackFromModel && fallbackResolution.fallbackFromReasoning) {
          executionTask = {
            ...task,
            model: fallbackResolution.model,
            reasoning: fallbackResolution.reasoning,
          };
          fallbackExecutionMetadata = {
            fromModel: fallbackResolution.fallbackFromModel,
            fromReasoning: fallbackResolution.fallbackFromReasoning,
            toModel: fallbackResolution.model,
            toReasoning: fallbackResolution.reasoning,
          };
        }
      } catch {
        executionTask = task;
      }
    }

    const scopeKey = getExecutionScopeKey(task);
    const abortController = new AbortController();
    const rawTaskTimeoutMs = resolveTaskTimeoutMs(executionTask);
    const taskTimeoutMs = Number.isFinite(rawTaskTimeoutMs) && rawTaskTimeoutMs > 0
      ? Math.floor(rawTaskTimeoutMs)
      : resolveTaskExecutionTimeoutMs(executionTask);

    const control: TaskControl = {
      stopped: false,
      forceStop: async () => {
        if (control.stopped) {
          return;
        }

        control.stopped = true;
        abortController.abort();
        taskAuditLogger?.log("stopped", "Force-stop requested", {
          scopeKey,
          taskId: task.id,
        });
        await statusReporter.report(
          task.id,
          "stopped",
          "Force-stopped by immediate action",
        );
        scheduler.finishTask(task.id);
        runningTasks.delete(task.id);
        runningTaskScopeById.delete(task.id);
        activeWorkers.delete(task.id);
        logger.log("stopped", `Task ${task.id} force-stopped`);
      },
    };

    runningTasks.set(task.id, control);
    runningTaskScopeById.set(task.id, scopeKey);
    if (fallbackExecutionMetadata) {
      logger.log(
        "running",
        `Task ${task.id} will run with fallback model ${fallbackExecutionMetadata.toModel} (${fallbackExecutionMetadata.toReasoning}) ` +
          `from ${fallbackExecutionMetadata.fromModel} (${fallbackExecutionMetadata.fromReasoning})`,
      );
    }

    const workerPromise = (async () => {
      try {
        const result = await workerExecutor(executionTask, templates, {
          auditLogger: taskAuditLogger,
          codexCommandTemplate,
          onListSubtaskComplete: (event) => {
            const duration = formatElapsedDuration(event.durationMs);
            const listItem = formatListItemForLog(event.itemValue);
            const modelInfo = fallbackExecutionMetadata
              ? `[model=${executionTask.model}, fallbackFrom=${fallbackExecutionMetadata.fromModel}, listItem=${listItem}]`
              : `[model=${executionTask.model}, listItem=${listItem}]`;
            const progressDetails =
              `Task ${task.id} list progress: ${event.current} of ${event.total} done in ` +
              `${duration} (status=${event.status}, attempts=${event.attempts}) ${modelInfo}`;
            if (event.status === "failed") {
              logger.log("failed", `🚀 ${progressDetails}`);
            } else {
              logger.log("running", progressDetails);
            }
            taskAuditLogger?.log(
              event.status === "done" ? "success" : "failure",
              "List subtask finished",
              {
                attempts: event.attempts,
                current: event.current,
                duration,
                durationMs: event.durationMs,
                itemValue: event.itemValue,
                listId: event.listId,
                status: event.status,
                taskId: event.taskId,
                total: event.total,
              },
            );
          },
          onCommandTimeout: (event) => {
            const timeoutLabel = formatTimeoutDuration(event.timeoutMs);
            logger.log(
              "failed",
              `Task ${task.id} timed out after ${timeoutLabel}; aborting Codex process`,
            );
            taskAuditLogger?.log("failure", "Task execution timed out; abort requested", {
              attempt: event.attempt,
              model: executionTask.model,
              reasoning: executionTask.reasoning,
              taskId: task.id,
              timeoutMs: event.timeoutMs,
              variantLabel: event.variantLabel,
            });
          },
          signal: abortController.signal,
          taskTimeoutMs,
        });

        if (control.stopped) {
          return;
        }

        await statusReporter.report(task.id, result.status, result.fullResponse);
        if (result.status === "done" && fallbackExecutionMetadata) {
          logger.log(
            "done",
            `Task ${task.id} done with fallback model ${fallbackExecutionMetadata.toModel} (${fallbackExecutionMetadata.toReasoning}) ` +
              `from ${fallbackExecutionMetadata.fromModel} (${fallbackExecutionMetadata.fromReasoning})`,
          );
        } else {
          logger.log(
            result.status === "done" ? "done" : "failed",
            `Task ${task.id} ${result.status}`,
          );
        }
      } catch (error) {
        if (control.stopped) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        await statusReporter.report(task.id, "failed", message);
        logger.log("failed", `Task ${task.id} failed: ${message}`);
      } finally {
        runningTasks.delete(task.id);
        runningTaskScopeById.delete(task.id);
        activeWorkers.delete(task.id);
        scheduler.finishTask(task.id);
      }
    })();

    activeWorkers.set(task.id, workerPromise);
    startedCount += 1;
  }

  logger.log(
    "running",
    `Started ${startedCount} task(s) out of ${fetchedTasks.length} fetched`,
  );
  return {
    fetched: fetchedTasks.length,
    slotsRequested,
    started: startedCount,
  };
}
