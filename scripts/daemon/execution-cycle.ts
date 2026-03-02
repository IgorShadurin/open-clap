import type { DaemonApiClient } from "./api-client";
import type { RunningTaskControl } from "./immediate-action-handler";
import type { LogStatus } from "./logger";
import { TaskScheduler } from "./scheduler";
import { StatusReporter } from "./status-reporter";
import type { WorkerTemplates } from "./template-renderer";
import type { TaskAuditLogger } from "./task-audit-log";
import type { WaitFunction } from "./retry";
import type { WorkerExecutionContext } from "./worker-types";
import {
  formatElapsedDuration,
  formatTimeoutDuration,
  resolveTaskExecutionTimeoutMs,
} from "./task-timeout-config";
import { DAEMON_RETRY_POLICY, retryAsync } from "./retry";
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

const FIVE_HOUR_MIN_REMAINING_PERCENT = 2;

interface FiveHourUsageRetryOptions {
  attempts?: number;
  delayMs?: number;
  wait?: WaitFunction;
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

async function shouldAllowExecutionBasedOnFiveHourUsage(
  apiClient: DaemonApiClient,
  logger: LoggerLike,
  retryOptions: FiveHourUsageRetryOptions = {},
): Promise<boolean> {
  const attempts = Number.isFinite(retryOptions.attempts)
    ? Math.max(1, Math.floor(retryOptions.attempts ?? 1))
    : DAEMON_RETRY_POLICY.attempts;
  const delayMs = Number.isFinite(retryOptions.delayMs)
    ? Math.max(0, Math.floor(retryOptions.delayMs ?? 0))
    : DAEMON_RETRY_POLICY.delayMs;

  try {
    const usage = await retryAsync(async () => {
      let fetchedUsage: { fiveHourUsedPercent: number } | null;
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
    const remainingPercent = computeRemainingFiveHourPercent(usage);
    if (remainingPercent === null) {
      logger.log(
        "waiting",
        `Execution paused: 5h usage values are invalid after ${attempts} attempts`,
      );
      return false;
    }

    if (remainingPercent < FIVE_HOUR_MIN_REMAINING_PERCENT) {
      logger.log(
        "waiting",
        `Execution paused: 5h limit remaining ${remainingPercent.toFixed(1)}%`,
      );
      return false;
    }
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason === "metrics_invalid") {
      logger.log(
        "waiting",
        `Execution paused: 5h usage values are invalid after ${attempts} attempts`,
      );
      return false;
    }
    if (reason === "metrics_fetch_failed") {
      logger.log(
        "waiting",
        `Execution paused: 5h usage check failed after ${attempts} attempts`,
      );
      return false;
    }
    logger.log(
      "waiting",
      `Execution paused: 5h usage metrics unavailable after ${attempts} attempts`,
    );
    return false;
  }
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
    logger.log("waiting", "No free execution slots");
    return { fetched: 0, slotsRequested, started: 0 };
  }

  if (!(await shouldAllowExecutionBasedOnFiveHourUsage(apiClient, logger, fiveHourUsageRetry))) {
    return { fetched: 0, slotsRequested, started: 0 };
  }

  const fetchedTasks = await apiClient.fetchNextTasks(slotsRequested);
  if (fetchedTasks.length < 1) {
    logger.log("waiting", "No queued tasks available");
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

    const scopeKey = getExecutionScopeKey(task);
    const abortController = new AbortController();
    const rawTaskTimeoutMs = resolveTaskTimeoutMs(task);
    const taskTimeoutMs = Number.isFinite(rawTaskTimeoutMs) && rawTaskTimeoutMs > 0
      ? Math.floor(rawTaskTimeoutMs)
      : resolveTaskExecutionTimeoutMs(task);

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

    const workerPromise = (async () => {
      try {
        const result = await workerExecutor(task, templates, {
          auditLogger: taskAuditLogger,
          codexCommandTemplate,
          onListSubtaskComplete: (event) => {
            const duration = formatElapsedDuration(event.durationMs);
            const progressDetails =
              `Task ${task.id} list progress: ${event.current} of ${event.total} done in ` +
              `${duration} (status=${event.status}, attempts=${event.attempts})`;
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
              model: task.model,
              reasoning: task.reasoning,
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
        logger.log(result.status === "done" ? "done" : "failed", `Task ${task.id} ${result.status}`);
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
