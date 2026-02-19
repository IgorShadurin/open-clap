import type {
  AcknowledgeImmediateActionResponse,
  AcknowledgeImmediateActionRequest,
  ClaimTasksRequest,
  ClaimTasksResponse,
  CompleteImmediateActionRequest,
  CompleteImmediateActionResponse,
  FetchImmediateActionsResponse,
  UpdateTaskStatusRequest,
  DaemonTask,
  DaemonTaskStatus,
  ImmediateAction,
} from "../../shared/contracts";

export interface DaemonApiClient {
  acknowledgeImmediateAction(actionId: string): Promise<void>;
  completeImmediateAction(actionId: string): Promise<void>;
  fetchImmediateActions(): Promise<ImmediateAction[]>;
  fetchNextTasks(limit: number): Promise<DaemonTask[]>;
  markTasksInProgress(taskIds: string[]): Promise<void>;
  reportTaskStatus(
    taskId: string,
    status: DaemonTaskStatus,
    finishedAt?: Date,
    fullResponse?: string,
    idempotencyKey?: string,
  ): Promise<void>;
}

export class NoopDaemonApiClient implements DaemonApiClient {
  public async acknowledgeImmediateAction(actionId: string): Promise<void> {
    void actionId;
  }

  public async fetchImmediateActions(): Promise<ImmediateAction[]> {
    return [];
  }

  public async completeImmediateAction(actionId: string): Promise<void> {
    void actionId;
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
    finishedAt?: Date,
    fullResponse?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    void taskId;
    void status;
    void finishedAt;
    void fullResponse;
    void idempotencyKey;
  }
}

export class HttpDaemonApiClient implements DaemonApiClient {
  public constructor(private readonly baseUrl: string) {}

  public async acknowledgeImmediateAction(actionId: string): Promise<void> {
    const body: AcknowledgeImmediateActionRequest = { actionId };
    const response = await fetch(`${this.baseUrl}/api/daemon/actions/ack`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to acknowledge immediate action ${actionId}`);
    }

    await response.json() as AcknowledgeImmediateActionResponse;
  }

  public async fetchImmediateActions(): Promise<ImmediateAction[]> {
    const response = await fetch(`${this.baseUrl}/api/daemon/actions/immediate`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch immediate actions");
    }

    const payload = (await response.json()) as FetchImmediateActionsResponse;
    return payload.actions;
  }

  public async completeImmediateAction(actionId: string): Promise<void> {
    const body: CompleteImmediateActionRequest = { actionId };
    const response = await fetch(`${this.baseUrl}/api/daemon/actions/execute`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to complete immediate action ${actionId}`);
    }

    await response.json() as CompleteImmediateActionResponse;
  }

  public async fetchNextTasks(limit: number): Promise<DaemonTask[]> {
    const body: ClaimTasksRequest = { limit };
    const response = await fetch(`${this.baseUrl}/api/daemon/tasks/claim`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to claim next tasks");
    }

    const payload = (await response.json()) as ClaimTasksResponse;
    return payload.tasks;
  }

  public async markTasksInProgress(taskIds: string[]): Promise<void> {
    void taskIds;
    // Claim endpoint atomically marks tasks as in-progress.
  }

  public async reportTaskStatus(
    taskId: string,
    status: DaemonTaskStatus,
    _finishedAt?: Date,
    fullResponse?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    const body: UpdateTaskStatusRequest = {
      fullResponse,
      idempotencyKey,
      status,
      taskId,
    };
    const response = await fetch(`${this.baseUrl}/api/daemon/tasks/status`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to report task status for ${taskId}`);
    }
  }
}
