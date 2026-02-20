import type { DaemonApiClient } from "./api-client";
import type { RunningTaskControl } from "./immediate-action-handler";
import type { LogStatus } from "./logger";
import { TaskScheduler } from "./scheduler";
import { StatusReporter } from "./status-reporter";
import type { WorkerTemplates } from "./template-renderer";
import type { TaskAuditLogger } from "./task-audit-log";
import type { DaemonTask, TaskExecutionResult } from "../../shared/contracts/task";
import { executeTask } from "./worker";
import {
  getExecutionScopeKey,
  selectParallelTasks,
} from "../../shared/logic/task-priority";

interface LoggerLike {
  log: (status: LogStatus, message: string) => void;
}

interface TaskControl extends RunningTaskControl {
  stopped: boolean;
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
  workerExecutor?: (
    task: DaemonTask,
    templates: WorkerTemplates,
    context?: {
      auditLogger?: TaskAuditLogger;
      codexCommandTemplate?: string;
      signal?: AbortSignal;
    },
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
  workerExecutor = executeTask,
}: RunTaskExecutionCycleOptions): Promise<ExecutionCycleResult> {
  const slotsRequested = scheduler.availableSlots();
  if (slotsRequested < 1) {
    logger.log("waiting", "No free execution slots");
    return { fetched: 0, slotsRequested, started: 0 };
  }

  const fetchedTasks = await apiClient.fetchNextTasks(slotsRequested);
  if (fetchedTasks.length < 1) {
    logger.log("waiting", "No queued tasks available");
    return { fetched: 0, slotsRequested, started: 0 };
  }

  const selectedTasks = selectParallelTasks(
    fetchedTasks,
    slotsRequested,
    new Set(runningTaskScopeById.values()),
  );

  const claimedTasks: DaemonTask[] = [];
  for (const task of selectedTasks) {
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

  for (const task of claimedTasks) {
    const scopeKey = getExecutionScopeKey(task);
    const abortController = new AbortController();

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
          signal: abortController.signal,
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
  }

  logger.log(
    "running",
    `Started ${claimedTasks.length} task(s) out of ${fetchedTasks.length} fetched`,
  );
  return {
    fetched: fetchedTasks.length,
    slotsRequested,
    started: claimedTasks.length,
  };
}
