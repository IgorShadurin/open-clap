import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import type { DaemonApiClient } from "../../scripts/daemon/api-client";
import { handleImmediateActions } from "../../scripts/daemon/immediate-action-handler";
import type { DaemonTask, DaemonTaskStatus, ImmediateAction } from "../../shared/contracts/task";

class FakeApiClient implements DaemonApiClient {
  public readonly acknowledgedActionIds: string[] = [];
  public readonly completedActionIds: string[] = [];
  public readonly reportedStatuses: Array<{
    taskId: string;
    status: DaemonTaskStatus;
  }> = [];

  public async acknowledgeImmediateAction(actionId: string): Promise<void> {
    this.acknowledgedActionIds.push(actionId);
  }

  public async fetchImmediateActions(): Promise<ImmediateAction[]> {
    return [];
  }

  public async completeImmediateAction(actionId: string): Promise<void> {
    this.completedActionIds.push(actionId);
  }

  public async fetchNextTasks(limit: number): Promise<DaemonTask[]> {
    void limit;
    return [];
  }

  public async markTasksInProgress(taskIds: string[]): Promise<void> {
    void taskIds;
  }

  public async reportTaskStatus(
    taskId: string,
    status: DaemonTaskStatus,
  ): Promise<void> {
    this.reportedStatuses.push({ taskId, status });
  }
}

test("handleImmediateActions force-stops running task and acknowledges actions", async () => {
  const apiClient = new FakeApiClient();
  const logs: string[] = [];
  let forceStopped = false;

  const runningTasks = new Map([
    [
      "task-1",
      {
        forceStop: async () => {
          forceStopped = true;
        },
      },
    ],
  ]);

  const result = await handleImmediateActions({
    actions: [
      { id: "a-1", taskId: "task-1", type: "force_stop" },
      { id: "a-2", taskId: "task-2", type: "force_stop" },
    ],
    apiClient,
    runningTasks,
    log: (message) => logs.push(message),
  });

  assert.equal(forceStopped, true);
  assert.deepEqual(result, { acknowledged: 2, stopped: 1 });
  assert.deepEqual(apiClient.acknowledgedActionIds, ["a-1", "a-2"]);
  assert.deepEqual(apiClient.completedActionIds, ["a-1"]);
  assert.deepEqual(apiClient.reportedStatuses, []);
  assert.equal(logs.some((line) => line.includes("non-running task task-2")), true);
});
