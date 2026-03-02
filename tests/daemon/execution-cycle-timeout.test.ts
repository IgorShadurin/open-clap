import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import type { DaemonCodexUsageState } from "../../scripts/daemon/api-client";
import type { DaemonApiClient } from "../../scripts/daemon/api-client";
import { runTaskExecutionCycle } from "../../scripts/daemon/execution-cycle";
import { TaskScheduler } from "../../scripts/daemon/scheduler";
import { StatusReporter } from "../../scripts/daemon/status-reporter";
import type { TaskAuditLogger, TaskAuditStatus } from "../../scripts/daemon/task-audit-log";
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
  public fiveHourUsage: Array<DaemonCodexUsageState | null | Error> = [];

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
    const usage = this.fiveHourUsage.shift();
    if (usage instanceof Error) {
      throw usage;
    }
    if (!usage) {
      return null;
    }
    return usage;
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
    model: "gpt-5.3-codex-spark",
    reasoning: "high",
    text: `Task ${taskId}`,
  };
}

test("runTaskExecutionCycle logs and records worker-reported command timeouts", async () => {
  const apiClient = new FakeApiClient();
  apiClient.queuedTasks = [createTask("timeout-task")];
  apiClient.fiveHourUsage = [{ fiveHourUsedPercent: 50 }];

  const scheduler = new TaskScheduler(1);
  const runningTasks = new Map();
  const runningTaskScopeById = new Map<string, string>();
  const activeWorkers = new Map<string, Promise<void>>();
  const logs: Array<{ message: string; status: string }> = [];
  const auditLogs: Array<{ message: string; payload: unknown; status: TaskAuditStatus }> = [];

  const taskAuditLogger: TaskAuditLogger = {
    filePath: "/tmp/test-timeout.log",
    log(status, message, payload): void {
      auditLogs.push({ message, payload, status });
    },
  };

  let observedTaskTimeoutMs = -1;

  const result = await runTaskExecutionCycle({
    activeWorkers,
    apiClient,
    logger: {
      log(status, message): void {
        logs.push({ message, status });
      },
    },
    resolveTaskTimeoutMs: () => 25,
    runningTasks,
    runningTaskScopeById,
    scheduler,
    statusReporter: new StatusReporter(apiClient),
    taskAuditLogger,
    templates,
    workerExecutor: async (_task, _templates, context): Promise<TaskExecutionResult> => {
      observedTaskTimeoutMs = context?.taskTimeoutMs ?? -1;
      context?.onCommandTimeout?.({
        attempt: 1,
        taskId: "timeout-task",
        timeoutMs: 25,
        variantLabel: "single",
      });

      return {
        finishedAt: new Date(),
        fullResponse: "Codex command timed out after 25ms",
        status: "failed",
      };
    },
  });

  assert.deepEqual(result, { fetched: 1, slotsRequested: 1, started: 1 });

  const workerPromise = activeWorkers.get("timeout-task");
  assert.ok(workerPromise);
  await workerPromise;

  assert.equal(observedTaskTimeoutMs, 25);
  assert.equal(apiClient.statusCalls.length, 1);
  assert.equal(apiClient.statusCalls[0]?.status, "failed");
  assert.equal(apiClient.statusCalls[0]?.fullResponse?.includes("timed out after 25ms"), true);
  assert.equal(
    logs.some((entry) => entry.status === "failed" && entry.message.includes("timed out after 25ms")),
    true,
  );
  assert.equal(
    auditLogs.some(
      (entry) => entry.status === "failure" && entry.message.includes("Task execution timed out"),
    ),
    true,
  );
});
