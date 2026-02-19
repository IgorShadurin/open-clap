import { TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import type { ApiErrorShape, TaskEntity } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import { deleteTask, updateTask } from "../../../../lib/entities-service";

interface UpdateTaskBody {
  includePreviousContext?: boolean;
  model?: string;
  paused?: boolean;
  previousContextMessages?: number;
  reasoning?: string;
  status?: TaskStatus;
  text?: string;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await context.params;
  let body: UpdateTaskBody;
  try {
    body = (await request.json()) as UpdateTaskBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  try {
    const task = await updateTask(taskId, body);
    return NextResponse.json<TaskEntity>(task, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("TASK_UPDATE_FAILED", "Failed to update task", message),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await context.params;
  try {
    await deleteTask(taskId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("TASK_DELETE_FAILED", "Failed to delete task", message),
      { status: 400 },
    );
  }
}
