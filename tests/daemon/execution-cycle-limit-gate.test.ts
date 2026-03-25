import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import type { DaemonCodexUsageState } from "../../scripts/daemon/api-client";
import type { DaemonApiClient } from "../../scripts/daemon/api-client";
import { runTaskExecutionCycle } from "../../scripts/daemon/execution-cycle";
import { TaskScheduler } from "../../scripts/daemon/scheduler";
import { StatusReporter } from "../../scripts/daemon/status-reporter";
import type { CodexUsageModelSummary, FetchDaemonSettingsResponse } from "../../shared/contracts";
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
  public usage: DaemonCodexUsageState | null = null;

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

  public async fetchCodexUsageState(): Promise<DaemonCodexUsageState | null> {
    return this.usage;
  }

  public async fetchNextTasks(limit: number, disallowedModels?: string[]): Promise<DaemonTask[]> {
    this.fetchCalls.push(limit);
    void disallowedModels;
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
    reasoning: "medium",
    text: `Task ${taskId}`,
  };
}

function createModelSummary(
  model: string,
  fiveHourUsedPercent: number,
  weeklyUsedPercent: number | null,
  allowed = true,
): CodexUsageModelSummary {
  return {
    allowed,
    fiveHourResetAt: "n/a",
    fiveHourUsedPercent,
    model,
    planType: "plus",
    weeklyResetAt: "n/a",
    weeklyUsedPercent,
  };
}

test("runTaskExecutionCycle does not claim tasks when Codex usage allowance is blocked", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("blocked-allowance-task")];
  apiClient.usage = {
    allowed: false,
    fiveHourUsedPercent: 0,
    models: [createModelSummary("gpt-5.3-codex", 0, 0, false)],
    weeklyUsedPercent: 0,
  };

  const logs: Array<{ message: string; status: string }> = [];
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
    scheduler: new TaskScheduler(1),
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (): Promise<TaskExecutionResult> => ({
      finishedAt: new Date(),
      fullResponse: "ok",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 1, started: 0 });
  assert.deepEqual(apiClient.fetchCalls, []);
  assert.equal(
    logs.some((entry) => entry.message.includes("limits exhausted or unavailable allowance")),
    true,
  );
});

test("runTaskExecutionCycle does not claim tasks when weekly remaining is below threshold", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("weekly-blocked-task")];
  apiClient.usage = {
    fiveHourUsedPercent: 1,
    weeklyUsedPercent: 99.4,
  };

  const logs: Array<{ message: string; status: string }> = [];
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
    scheduler: new TaskScheduler(1),
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (): Promise<TaskExecutionResult> => ({
      finishedAt: new Date(),
      fullResponse: "ok",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 1, started: 0 });
  assert.deepEqual(apiClient.fetchCalls, []);
  assert.equal(
    logs.some((entry) => entry.message.includes("weekly limit remaining 0.6%")),
    true,
  );
});

test("runTaskExecutionCycle does not claim tasks when all model limits are blocked", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("all-models-blocked-task")];
  apiClient.usage = {
    fiveHourUsedPercent: 0,
    models: [
      createModelSummary("gpt-5.3-codex", 0, 0, false),
      createModelSummary("gpt-5.3-codex-spark", 0, 0, false),
    ],
    weeklyUsedPercent: 0,
  };

  const logs: Array<{ message: string; status: string }> = [];
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
    scheduler: new TaskScheduler(1),
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (): Promise<TaskExecutionResult> => ({
      finishedAt: new Date(),
      fullResponse: "ok",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 1, started: 0 });
  assert.deepEqual(apiClient.fetchCalls, []);
  assert.equal(
    logs.some((entry) =>
      entry.message.includes("model limits are below 2% or blocked for all available models"),
    ),
    true,
  );
});
