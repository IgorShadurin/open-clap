import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import type { DaemonApiClient } from "../../scripts/daemon/api-client";
import { runTaskExecutionCycle } from "../../scripts/daemon/execution-cycle";
import { TaskScheduler } from "../../scripts/daemon/scheduler";
import { StatusReporter } from "../../scripts/daemon/status-reporter";
import type { FetchDaemonSettingsResponse } from "../../shared/contracts";
import type {
  DaemonTask,
  DaemonTaskStatus,
  ImmediateAction,
  TaskExecutionResult,
} from "../../shared/contracts/task";

class FakeApiClient implements DaemonApiClient {
  public readonly fetchCalls: number[] = [];
  public readonly inProgressCalls: string[][] = [];
  public readonly statusCalls: Array<{
    fullResponse?: string;
    status: DaemonTaskStatus;
    taskId: string;
  }> = [];
  public queuedTasks: DaemonTask[] = [];
  public fiveHourUsage: Array<number | null | Error> = [];

  public async acknowledgeImmediateAction(actionId: string): Promise<void> {
    void actionId;
  }

  public async completeImmediateAction(actionId: string): Promise<void> {
    void actionId;
  }

  public async fetchImmediateActions(): Promise<ImmediateAction[]> {
    return [];
  }

  public async fetchRuntimeSettings(): Promise<FetchDaemonSettingsResponse> {
    return {
      changed: false,
      revision: "fake",
    };
  }

  public async fetchCodexUsageState(): Promise<{ fiveHourUsedPercent: number } | null> {
    const usage = this.fiveHourUsage.shift();
    if (usage instanceof Error) {
      throw usage;
    }
    if (typeof usage !== "number") {
      return null;
    }
    return { fiveHourUsedPercent: usage };
  }

  public async fetchNextTasks(limit: number): Promise<DaemonTask[]> {
    this.fetchCalls.push(limit);
    return this.queuedTasks.slice(0, limit);
  }

  public async markTasksInProgress(taskIds: string[]): Promise<void> {
    this.inProgressCalls.push(taskIds);
  }

  public async reportTaskStatus(
    taskId: string,
    status: DaemonTaskStatus,
    _finishedAt?: Date,
    fullResponse?: string,
  ): Promise<void> {
    this.statusCalls.push({ fullResponse, status, taskId });
  }
}

const templates = {
  defaultTemplate: "Context={{context}} Task={{task}}",
  historyTemplate: "History={{history}} Context={{context}} Task={{task}}",
};

function createTask(taskId: string): DaemonTask {
  return {
    contextPath: `/tmp/${taskId}`,
    id: taskId,
    includeHistory: false,
    model: "gpt-5.3-codex",
    reasoning: "high",
    text: `Task ${taskId}`,
  };
}

test("runTaskExecutionCycle logs list prompt count for list-based tasks", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [
    {
      ...createTask("list-log-task"),
      listExecution: {
        items: ["en-US", "fr-FR", "de-DE"],
        listId: "ios-langs",
      },
      text: "Translate $list-ios-langs and keep $list-ios-langs consistent",
    },
  ];
  apiClient.fiveHourUsage = [50];

  const scheduler = new TaskScheduler(1);
  const activeWorkers = new Map<string, Promise<void>>();
  const logs: Array<{ message: string; status: string }> = [];

  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: {
      log(status, message): void {
        logs.push({ message, status });
      },
    },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (): Promise<TaskExecutionResult> => ({
      finishedAt: new Date(),
      fullResponse: "ok",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 1, slotsRequested: 1, started: 1 });
  await Promise.allSettled([...activeWorkers.values()]);
  assert.equal(
    logs.some((log) =>
      log.message.includes("Task list-log-task uses $list-ios-langs; prompts=3"),
    ),
    true,
  );
});

test("runTaskExecutionCycle logs list subtask progress with duration", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [
    {
      ...createTask("list-progress-task"),
      listExecution: {
        items: ["en-US", "fr-FR"],
        listId: "ios-langs",
      },
      text: "Translate $list-ios-langs and keep $list-ios-langs consistent",
    },
  ];
  apiClient.fiveHourUsage = [50];

  const scheduler = new TaskScheduler(1);
  const activeWorkers = new Map<string, Promise<void>>();
  const logs: Array<{ message: string; status: string }> = [];

  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: {
      log(status, message): void {
        logs.push({ message, status });
      },
    },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (task, _templates, context): Promise<TaskExecutionResult> => {
      context?.onListSubtaskComplete?.({
        attempts: 1,
        current: 1,
        durationMs: 1_200,
        itemValue: "en-US",
        listId: "ios-langs",
        status: "done",
        taskId: task.id,
        total: 2,
      });
      context?.onListSubtaskComplete?.({
        attempts: 2,
        current: 2,
        durationMs: 8_200,
        itemValue: "fr-FR",
        listId: "ios-langs",
        status: "failed",
        taskId: task.id,
        total: 2,
      });
      return {
        finishedAt: new Date(),
        fullResponse: "done",
        status: "done",
      };
    },
  });

  assert.deepEqual(result, { fetched: 1, slotsRequested: 1, started: 1 });
  await Promise.allSettled([...activeWorkers.values()]);
  assert.equal(
    logs.some((log) =>
      log.message.includes(
        "Task list-progress-task list progress: 1 of 2 done in 1.2s (status=done, attempts=1)",
      ),
    ),
    true,
  );
  assert.equal(
    logs.some((log) =>
      log.message.includes(
        "🚀 Task list-progress-task list progress: 2 of 2 done in 8.2s (status=failed, attempts=2)",
      ),
    ),
    true,
  );
  assert.equal(
    logs.some(
      (log) =>
        log.status === "failed" &&
        log.message.startsWith(
          "🚀 Task list-progress-task list progress: 2 of 2 done in 8.2s",
        ),
    ),
    true,
  );
});

test("runTaskExecutionCycle rejects tasks that reference multiple list types", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [
    {
      ...createTask("multi-list-task"),
      text: "Run for $list-ios-langs and $list-country-codes",
    },
  ];
  apiClient.fiveHourUsage = [50];

  const scheduler = new TaskScheduler(1);
  const logs: Array<{ message: string; status: string }> = [];
  let workerCalls = 0;

  const result = await runTaskExecutionCycle({
    activeWorkers: new Map(),
    apiClient,
    logger: {
      log(status, message): void {
        logs.push({ message, status });
      },
    },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (): Promise<TaskExecutionResult> => {
      workerCalls += 1;
      return {
        finishedAt: new Date(),
        fullResponse: "ok",
        status: "done",
      };
    },
  });

  assert.deepEqual(result, { fetched: 1, slotsRequested: 1, started: 0 });
  assert.equal(workerCalls, 0);
  assert.equal(apiClient.statusCalls.length, 1);
  assert.equal(apiClient.statusCalls[0]?.status, "failed");
  assert.equal(
    apiClient.statusCalls[0]?.fullResponse?.includes("Task can reference only one list type"),
    true,
  );
  assert.equal(
    logs.some((log) =>
      log.message.includes("Task multi-list-task failed: Task can reference only one list type"),
    ),
    true,
  );
});
