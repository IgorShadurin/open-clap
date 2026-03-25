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
  public readonly acknowledgedActions: string[] = [];
  public readonly fetchCalls: number[] = [];
  public readonly fetchDisallowedModels: string[][] = [];
  public readonly inProgressCalls: string[][] = [];
  public readonly statusCalls: Array<{
    taskId: string;
    status: DaemonTaskStatus;
    fullResponse?: string;
  }> = [];
  public queuedTasks: DaemonTask[] = [];
  public fiveHourUsage: Array<DaemonCodexUsageState | null | Error> = [];
  public fiveHourUsageFetchCount = 0;

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

  public async fetchCodexUsageState(): Promise<DaemonCodexUsageState | null> {
    this.fiveHourUsageFetchCount += 1;
    const usage = this.fiveHourUsage.shift();
    if (usage instanceof Error) {
      throw usage;
    }
    if (!usage) {
      return null;
    }

    return usage;
  }

  public async completeImmediateAction(actionId: string): Promise<void> {
    void actionId;
  }

  public async fetchNextTasks(limit: number, disallowedModels?: string[]): Promise<DaemonTask[]> {
    this.fetchCalls.push(limit);
    const disallowedSet = new Set((disallowedModels ?? []).map((value) => value.toLowerCase()));
    this.fetchDisallowedModels.push([...disallowedSet]);
    const selected: DaemonTask[] = [];
    for (const task of this.queuedTasks) {
      if (selected.length >= limit) {
        break;
      }
      if (disallowedSet.has(task.model.toLowerCase())) {
        break;
      }
      selected.push(task);
    }
    return selected;
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

function createModelSummary(
  model: string,
  fiveHourUsedPercent: number,
): CodexUsageModelSummary {
  return {
    allowed: true,
    fiveHourResetAt: "n/a",
    fiveHourUsedPercent,
    model,
    planType: "plus",
    weeklyResetAt: "n/a",
    weeklyUsedPercent: 0,
  };
}

test("runTaskExecutionCycle fetches by free slots and reports task completion", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("t1"), createTask("t2"), createTask("t3")];
  apiClient.fiveHourUsage = [{ fiveHourUsedPercent: 50 }];

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
  apiClient.fiveHourUsage = [{ fiveHourUsedPercent: 50 }];
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

test("runTaskExecutionCycle does not log free-slot warning when a task is already running", async () => {
  const apiClient = new FakeApiClient();
  const scheduler = new TaskScheduler(1);
  scheduler.startTask("occupied");

  const activeWorkers = new Map<string, Promise<void>>();
  activeWorkers.set("occupied", Promise.resolve());
  const runningTasks = new Map<string, { forceStop: () => Promise<void> | void }>();
  runningTasks.set("occupied", {
    forceStop: () => {},
  });

  const logs: Array<{ message: string; status: string }> = [];
  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: {
      log(status, message): void {
        logs.push({ message, status });
      },
    },
    runningTasks,
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
  assert.equal(logs.some((entry) => entry.message.includes("No free execution slots")), false);
});

test("runTaskExecutionCycle starts fetched tasks in claim order when capacity allows", async () => {
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
  apiClient.fiveHourUsage = [{ fiveHourUsedPercent: 50 }];

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

  assert.equal(result.started, 6);
  assert.deepEqual(apiClient.inProgressCalls, [
    ["p1-main-1", "p1-main-2", "p1-sub1-1", "p1-sub1-2", "p1-sub2-1", "p2-main-1"],
  ]);
});

test("runTaskExecutionCycle force-stop prevents duplicate done status", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("force-stop-task")];
  apiClient.fiveHourUsage = [{ fiveHourUsedPercent: 50 }];

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

test("runTaskExecutionCycle waits when 5h remaining is below threshold", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("low-limit-task")];
  apiClient.fiveHourUsage = [{ fiveHourUsedPercent: 99 }];

  const scheduler = new TaskScheduler(1);
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
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async () => ({
      finishedAt: new Date(),
      fullResponse: "",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 1, started: 0 });
  assert.deepEqual(apiClient.fetchCalls, []);
  assert.equal(logs.some((log) => log.status === "waiting"), true);
  assert.equal(logs.some((log) => log.message.includes("5h limit remaining")), true);
});

test("runTaskExecutionCycle does not skip head task when spark has no limits and fallback is unavailable", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [
    {
      ...createTask("spark-task"),
      model: "gpt-5.3-codex-spark",
    },
    {
      ...createTask("codex-task"),
      model: "gpt-5.3-codex",
    },
  ];
  apiClient.fiveHourUsage = [{
    fiveHourUsedPercent: 50,
    models: [
      createModelSummary("gpt-5.3-codex-spark", 99.6),
      createModelSummary("gpt-5.3-codex", 99.4),
    ],
  }];

  const scheduler = new TaskScheduler(2);
  const activeWorkers = new Map<string, Promise<void>>();

  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: { log: () => {} },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async () => ({
      finishedAt: new Date(),
      fullResponse: "Fake worker response",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 2, started: 0 });
  assert.deepEqual(apiClient.fetchDisallowedModels, []);
  assert.deepEqual(apiClient.inProgressCalls, []);
  await Promise.allSettled([...activeWorkers.values()]);
});

test("runTaskExecutionCycle starts spark task with fallback model when spark is limited", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [
    {
      ...createTask("spark-task-1"),
      model: "gpt-5.3-codex-spark",
    },
  ];
  apiClient.fiveHourUsage = [{
    fiveHourUsedPercent: 50,
    models: [
      createModelSummary("gpt-5.3-codex-spark", 99.6),
      createModelSummary("gpt-5.3-codex", 70),
    ],
  }, {
    fiveHourUsedPercent: 50,
    models: [
      createModelSummary("gpt-5.3-codex-spark", 99.6),
      createModelSummary("gpt-5.3-codex", 70),
    ],
  }];

  const scheduler = new TaskScheduler(1);
  const activeWorkers = new Map<string, Promise<void>>();
  const logs: Array<{ message: string; status: string }> = [];
  const executedModels: string[] = [];
  const executedReasonings: string[] = [];

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
    workerExecutor: async (task) => {
      executedModels.push(task.model);
      executedReasonings.push(task.reasoning);
      return {
        finishedAt: new Date(),
        fullResponse: "Fake worker response",
        status: "done",
      };
    },
  });

  assert.deepEqual(result, { fetched: 1, slotsRequested: 1, started: 1 });
  assert.deepEqual(apiClient.fetchDisallowedModels, [[]]);
  assert.deepEqual(apiClient.inProgressCalls, [["spark-task-1"]]);
  await Promise.allSettled([...activeWorkers.values()]);
  assert.deepEqual(executedModels, ["gpt-5.3-codex"]);
  assert.deepEqual(executedReasonings, ["medium"]);
  assert.equal(
    logs.some((entry) =>
      entry.message.includes(
        "Task spark-task-1 will run with fallback model gpt-5.3-codex (medium) from gpt-5.3-codex-spark (high)",
      ),
    ),
    true,
  );
  assert.equal(
    logs.some((entry) =>
      entry.message.includes(
        "Task spark-task-1 done with fallback model gpt-5.3-codex (medium) from gpt-5.3-codex-spark (high)",
      ),
    ),
    true,
  );
  assert.equal(
    logs.filter((entry) => entry.status === "done" && entry.message.includes("Task spark-task-1")).length,
    1,
  );
});

test("runTaskExecutionCycle pauses when all model-specific 5h limits are below 2%", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("all-blocked-task")];
  apiClient.fiveHourUsage = [{
    fiveHourUsedPercent: 50,
    models: [
      createModelSummary("gpt-5.3-codex-spark", 99.7),
      createModelSummary("gpt-5.3-codex", 99.5),
    ],
  }];

  const scheduler = new TaskScheduler(1);
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
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async () => ({
      finishedAt: new Date(),
      fullResponse: "",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 1, started: 0 });
  assert.deepEqual(apiClient.fetchCalls, []);
  assert.equal(
    logs.some((log) =>
      log.message.includes("model limits are below 2% or blocked for all available models")
    ),
    true,
  );
});

test("runTaskExecutionCycle re-checks spark fallback for each task and does not remember fallback", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [
    {
      ...createTask("spark-task-1"),
      model: "gpt-5.3-codex-spark",
    },
    {
      ...createTask("spark-task-2"),
      model: "gpt-5.3-codex-spark",
    },
  ];
  apiClient.fiveHourUsage = [{
    fiveHourUsedPercent: 50,
    models: [
      createModelSummary("gpt-5.3-codex-spark", 99.6),
      createModelSummary("gpt-5.3-codex", 70),
    ],
  }, {
    fiveHourUsedPercent: 50,
    models: [
      createModelSummary("gpt-5.3-codex-spark", 99.6),
      createModelSummary("gpt-5.3-codex", 70),
    ],
  }, {
    fiveHourUsedPercent: 50,
    models: [
      createModelSummary("gpt-5.3-codex-spark", 20),
      createModelSummary("gpt-5.3-codex", 70),
    ],
  }];

  const scheduler = new TaskScheduler(2);
  const activeWorkers = new Map<string, Promise<void>>();
  const executedModels: string[] = [];
  const executedTaskIds: string[] = [];

  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: { log: () => {} },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async (task) => {
      executedTaskIds.push(task.id);
      executedModels.push(task.model);
      return {
        finishedAt: new Date(),
        fullResponse: "Fake worker response",
        status: "done",
      };
    },
  });

  assert.deepEqual(result, { fetched: 2, slotsRequested: 2, started: 2 });
  await Promise.allSettled([...activeWorkers.values()]);
  assert.deepEqual(executedTaskIds, ["spark-task-1", "spark-task-2"]);
  assert.deepEqual(executedModels, ["gpt-5.3-codex", "gpt-5.3-codex-spark"]);
  assert.equal(apiClient.fiveHourUsageFetchCount, 3);
});

test("runTaskExecutionCycle waits when usage metrics are unavailable", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("metric-unknown-task")];
  apiClient.fiveHourUsage = [null, null, null];
  const scheduler = new TaskScheduler(1);
  const logs: Array<{ message: string; status: string }> = [];
  const waits: number[] = [];
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
    fiveHourUsageRetry: {
      attempts: 3,
      delayMs: 3000,
      wait: async (ms) => {
        waits.push(ms);
      },
    },
    workerExecutor: async () => ({
      finishedAt: new Date(),
      fullResponse: "",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 0, slotsRequested: 1, started: 0 });
  assert.deepEqual(apiClient.fetchCalls, []);
  assert.equal(apiClient.fiveHourUsageFetchCount, 3);
  assert.deepEqual(waits, [3000, 3000]);
  assert.equal(logs.some((log) => log.message.includes("5h usage metrics unavailable after 3 attempts")), true);
});
test("runTaskExecutionCycle retries 5h usage checks and starts once usage is available", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("retry-then-run-task")];
  apiClient.fiveHourUsage = [null, new Error("fetch failed"), { fiveHourUsedPercent: 96 }];
  const scheduler = new TaskScheduler(1);
  const activeWorkers = new Map<string, Promise<void>>();
  const waits: number[] = [];
  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: { log: () => {} },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    fiveHourUsageRetry: {
      attempts: 3,
      delayMs: 3000,
      wait: async (ms) => {
        waits.push(ms);
      },
    },
    workerExecutor: async () => ({
      finishedAt: new Date(),
      fullResponse: "Fake worker response",
      status: "done",
    }),
  });

  assert.deepEqual(result, { fetched: 1, slotsRequested: 1, started: 1 });
  assert.equal(apiClient.fiveHourUsageFetchCount, 3);
  assert.deepEqual(waits, [3000, 3000]);
  assert.deepEqual(apiClient.fetchCalls, [1]);
  await Promise.allSettled([...activeWorkers.values()]);
});
test("runTaskExecutionCycle resumes when 5h remaining rises above threshold", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("ok-task")];
  apiClient.fiveHourUsage = [{ fiveHourUsedPercent: 96 }];
  const scheduler = new TaskScheduler(1);
  const activeWorkers = new Map<string, Promise<void>>();
  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: { log: () => {} },
    runningTasks: new Map(),
    runningTaskScopeById: new Map(),
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    templates,
    workerExecutor: async () => ({
      finishedAt: new Date(),
      fullResponse: "Fake worker response",
      status: "done",
    }),
  });
  assert.deepEqual(result, { fetched: 1, slotsRequested: 1, started: 1 });
  assert.deepEqual(apiClient.fetchCalls, [1]);
  await Promise.allSettled([...activeWorkers.values()]);
});
