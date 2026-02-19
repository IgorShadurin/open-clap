import type { DaemonApiClient } from "./api-client";
import type { ImmediateAction } from "../../shared/contracts/task";

export interface RunningTaskControl {
  forceStop: () => Promise<void> | void;
}

export interface HandleImmediateActionsOptions {
  actions: ImmediateAction[];
  apiClient: DaemonApiClient;
  runningTasks: Map<string, RunningTaskControl>;
  log: (message: string) => void;
}

export interface HandleImmediateActionsResult {
  acknowledged: number;
  stopped: number;
}

export async function handleImmediateActions({
  actions,
  apiClient,
  runningTasks,
  log,
}: HandleImmediateActionsOptions): Promise<HandleImmediateActionsResult> {
  let acknowledged = 0;
  let stopped = 0;

  for (const action of actions) {
    const runningTask = runningTasks.get(action.taskId);

    if (action.type === "force_stop" && runningTask) {
      await runningTask.forceStop();
      await apiClient.completeImmediateAction(action.id);
      stopped += 1;
      log(`Force-stopped task ${action.taskId}`);
    } else if (action.type === "force_stop") {
      log(`Force-stop requested for non-running task ${action.taskId}`);
    }

    await apiClient.acknowledgeImmediateAction(action.id);
    acknowledged += 1;
  }

  return { acknowledged, stopped };
}
