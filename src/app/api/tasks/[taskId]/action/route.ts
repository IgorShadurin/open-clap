import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { setTaskAction } from "../../../../../lib/entities-service";

interface TaskActionBody {
  action: "pause" | "remove" | "resume" | "stop";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await context.params;
  let body: TaskActionBody;
  try {
    body = (await request.json()) as TaskActionBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.action !== "string") {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `action` is required"),
      { status: 400 },
    );
  }

  try {
    await setTaskAction(taskId, body.action);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("TASK_ACTION_FAILED", "Failed to update task action", message),
      { status: 400 },
    );
  }
}
