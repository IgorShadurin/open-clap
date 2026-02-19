export type DaemonTaskStatus =
  | "created"
  | "in_progress"
  | "done"
  | "failed"
  | "stopped";

export type ImmediateActionType = "force_stop";

export interface DaemonTask {
  id: string;
  text: string;
  contextPath: string;
  priority?: number;
  previousContextMessages?: number;
  projectId?: string;
  model: string;
  reasoning: string;
  subprojectId?: string | null;
  includeHistory: boolean;
  history?: string;
}

export interface TaskExecutionResult {
  status: Exclude<DaemonTaskStatus, "created">;
  fullResponse: string;
  finishedAt: Date;
}

export interface ImmediateAction {
  id: string;
  taskId: string;
  type: ImmediateActionType;
}

export interface FetchNextTasksRequest {
  limit: number;
}

export interface FetchNextTasksResponse {
  tasks: DaemonTask[];
}

export interface MarkTasksInProgressRequest {
  taskIds: string[];
}

export interface TaskStatusReportRequest {
  finishedAt?: Date;
  fullResponse?: string;
  status: DaemonTaskStatus;
  taskId: string;
}
