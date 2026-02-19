import type { DaemonApiClient } from "./api-client";
import type { DaemonTaskStatus } from "../../shared/contracts/task";
import crypto from "node:crypto";

export class StatusReporter {
  public constructor(private readonly apiClient: DaemonApiClient) {}

  public async report(
    taskId: string,
    status: DaemonTaskStatus,
    fullResponse?: string,
  ): Promise<void> {
    const finishedAt = status === "done" || status === "failed" ? new Date() : undefined;
    const idempotencyKey = crypto
      .createHash("sha1")
      .update(
        JSON.stringify({
          fullResponse: fullResponse ?? "",
          status,
          taskId,
        }),
      )
      .digest("hex");

    await this.apiClient.reportTaskStatus(
      taskId,
      status,
      finishedAt,
      fullResponse,
      idempotencyKey,
    );
  }
}
