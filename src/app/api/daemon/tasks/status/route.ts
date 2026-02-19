import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  UpdateTaskStatusRequest,
  UpdateTaskStatusResponse,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { updateTaskStatus } from "../../../../../lib/daemon-api";

export async function POST(request: Request): Promise<NextResponse> {
  let body: UpdateTaskStatusRequest;
  try {
    body = (await request.json()) as UpdateTaskStatusRequest;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.taskId !== "string" || typeof body.status !== "string") {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Fields `taskId` and `status` are required",
      ),
      { status: 400 },
    );
  }

  const updated = await updateTaskStatus(
    body.taskId,
    body.status,
    body.fullResponse,
    body.idempotencyKey,
  );

  return NextResponse.json<UpdateTaskStatusResponse>({ updated }, { status: 200 });
}
