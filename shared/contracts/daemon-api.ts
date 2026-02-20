import type {
  DaemonTask,
  DaemonTaskStatus,
  ImmediateAction,
} from "./task";

export interface ClaimTasksRequest {
  limit: number;
}

export interface ClaimTasksResponse {
  tasks: DaemonTask[];
}

export interface UpdateTaskStatusRequest {
  fullResponse?: string;
  idempotencyKey?: string;
  status: DaemonTaskStatus;
  taskId: string;
}

export interface UpdateTaskStatusResponse {
  updated: boolean;
}

export interface FetchImmediateActionsResponse {
  actions: ImmediateAction[];
}

export interface DaemonRuntimeSettings {
  codex_command_template: string;
  daemon_max_parallel_tasks: string;
  task_message_template: string;
  task_message_template_with_history: string;
}

export interface FetchDaemonSettingsResponse {
  changed: boolean;
  revision: string;
  settings?: DaemonRuntimeSettings;
}

export interface AcknowledgeImmediateActionRequest {
  actionId: string;
}

export interface AcknowledgeImmediateActionResponse {
  acknowledged: boolean;
}

export interface RegisterImmediateActionRequest {
  taskId: string;
  type?: "force_stop";
}

export interface RegisterImmediateActionResponse {
  actionId: string;
  created: boolean;
}

export interface CompleteImmediateActionRequest {
  actionId: string;
}

export interface CompleteImmediateActionResponse {
  completed: boolean;
}
