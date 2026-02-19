import type { DaemonTask, TaskExecutionResult } from "../../shared/contracts/task";
import {
  renderTaskPrompt,
  type WorkerTemplates,
} from "./template-renderer";

export function buildTaskMessage(
  task: DaemonTask,
  templates: WorkerTemplates,
): string {
  return renderTaskPrompt(task, templates);
}

export async function executeTask(
  task: DaemonTask,
  templates: WorkerTemplates,
): Promise<TaskExecutionResult> {
  const message = buildTaskMessage(task, templates);
  const response = `Simulated Codex response for task ${task.id}\n${message}`;

  return {
    status: "done",
    fullResponse: response,
    finishedAt: new Date(),
  };
}
