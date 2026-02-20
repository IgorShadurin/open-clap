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
  public readonly acknowledgedActions: string[] = [];
  public readonly fetchCalls: number[] = [];
  public readonly inProgressCalls: string[][] = [];
  public readonly statusCalls: Array<{
    taskId: string;
    status: DaemonTaskStatus;
    fullResponse?: string;
  }> = [];
  public queuedTasks: DaemonTask[] = [];

  public async acknowledgeImmediateAction(actionId: string): Promise<void> {
    this.acknowledgedActions.push(actionId);
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

  public async completeImmediateAction(actionId: string): Promise<void> {
    void actionId;
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
    this.statusCalls.push({ taskId, status, fullResponse });
  }
}

const templates = {
  defaultTemplate: "Context={{context}} Task={{task}}",
  historyTemplate: "History={{history}} Context={{context}} Task={{task}}",
};

function createTask(taskId: string): DaemonTask {
  return {
    id: taskId,
    text: `Task ${taskId}`,
    contextPath: `/tmp/${taskId}`,
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };
}

test("runTaskExecutionCycle fetches by free slots and reports task completion", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("t1"), createTask("t2"), createTask("t3")];

  const scheduler = new TaskScheduler(2);
  const runningTasks = new Map();
  const runningTaskScopeById = new Map<string, string>();
  const activeWorkers = new Map<string, Promise<void>>();
  const logs: Array<{ message: string; status: string }> = [];
  const statusReporter = new StatusReporter(apiClient);

  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: {
      log(status, message): void {
        logs.push({ message, status });
      },
    },
    runningTasks,
    runningTaskScopeById,
    scheduler,
    statusReporter,
    templates,
    workerExecutor: async (task) => ({
      finishedAt: new Date(),
      fullResponse: `Fake worker response for ${task.id}`,
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 2, slotsRequested: 2, started: 2 });
  assert.deepEqual(apiClient.fetchCalls, [2]);
  assert.deepEqual(apiClient.inProgressCalls, [["t1", "t2"]]);

  await Promise.allSettled([...activeWorkers.values()]);

  const doneCalls = apiClient.statusCalls.filter((call) => call.status === "done");
  assert.equal(doneCalls.length, 2);
  assert.equal(doneCalls.every((call) => call.fullResponse?.includes("Fake worker response")), true);
  assert.equal(scheduler.activeCount(), 0);
  assert.equal(runningTasks.size, 0);
  assert.equal(runningTaskScopeById.size, 0);
  assert.equal(logs.some((log) => log.status === "running"), true);
});

test("runTaskExecutionCycle skips fetching when there is no capacity", async () => {
  const apiClient = new FakeApiClient();
  const scheduler = new TaskScheduler(1);
  scheduler.startTask("occupied");

  const result = await runTaskExecutionCycle({
    activeWorkers: new Map(),
    apiClient,
    logger: { log: () => {} },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (task) => ({
      finishedAt: new Date(),
      fullResponse: `Fake worker response for ${task.id}`,
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 0, started: 0 });
  assert.deepEqual(apiClient.fetchCalls, []);
  assert.deepEqual(apiClient.inProgressCalls, []);
});

test("runTaskExecutionCycle starts at most one task per project/subproject scope", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [
    createTask("p1-main-1"),
    createTask("p1-main-2"),
    createTask("p1-sub1-1"),
    createTask("p1-sub1-2"),
    createTask("p1-sub2-1"),
    createTask("p2-main-1"),
  ].map((task) => {
    if (task.id.startsWith("p1-sub1")) {
      return { ...task, projectId: "p1", subprojectId: "s1" };
    }
    if (task.id.startsWith("p1-sub2")) {
      return { ...task, projectId: "p1", subprojectId: "s2" };
    }
    if (task.id.startsWith("p2-main")) {
      return { ...task, projectId: "p2", subprojectId: null };
    }
    return { ...task, projectId: "p1", subprojectId: null };
  });

  const scheduler = new TaskScheduler(10);
  const result = await runTaskExecutionCycle({
    activeWorkers: new Map(),
    apiClient,
    logger: { log: () => {} },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
  });

  assert.equal(result.started, 4);
  assert.deepEqual(apiClient.inProgressCalls, [
    ["p1-main-1", "p1-sub1-1", "p1-sub2-1", "p2-main-1"],
  ]);
});

test("runTaskExecutionCycle force-stop prevents duplicate done status", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("force-stop-task")];

  const scheduler = new TaskScheduler(1);
  const runningTasks = new Map();
  const runningTaskScopeById = new Map<string, string>();
  const activeWorkers = new Map<string, Promise<void>>();
  const statusReporter = new StatusReporter(apiClient);

  let resolveTask:
    | ((result: TaskExecutionResult) => void)
    | undefined;
  const executionPromise = new Promise<TaskExecutionResult>((resolve) => {
    resolveTask = resolve;
  });

  await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: { log: () => {} },
    runningTasks,
    runningTaskScopeById,
    scheduler,
    statusReporter,
    templates,
    workerExecutor: async () => executionPromise,
  });

  const workerPromise = activeWorkers.get("force-stop-task");
  assert.ok(workerPromise);

  const control = runningTasks.get("force-stop-task");
  assert.ok(control);
  await control.forceStop();
  await control.forceStop();

  resolveTask?.({
    status: "done",
    fullResponse: "final response",
    finishedAt: new Date(),
  });
  await workerPromise;

  const stoppedCalls = apiClient.statusCalls.filter((call) => call.status === "stopped");
  const doneCalls = apiClient.statusCalls.filter((call) => call.status === "done");

  assert.equal(stoppedCalls.length, 1);
  assert.equal(doneCalls.length, 0);
});
