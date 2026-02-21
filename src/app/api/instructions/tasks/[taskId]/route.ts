import { NextResponse } from "next/server";

import type { ApiErrorShape, InstructionTaskEntity } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import {
  deleteInstructionTask,
  updateInstructionTask,
} from "../../../../../lib/instructions-service";

interface UpdateInstructionTaskBody {
  includePreviousContext?: boolean;
  model?: string;
  paused?: boolean;
  previousContextMessages?: number;
  reasoning?: string;
  text?: string;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await context.params;
  let body: UpdateInstructionTaskBody;
  try {
    body = (await request.json()) as UpdateInstructionTaskBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  try {
    const task = await updateInstructionTask(taskId, body);
    return NextResponse.json<InstructionTaskEntity>(task, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INSTRUCTION_TASK_UPDATE_FAILED",
        "Failed to update instruction task",
        message,
      ),
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
    await deleteInstructionTask(taskId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INSTRUCTION_TASK_DELETE_FAILED",
        "Failed to delete instruction task",
        message,
      ),
      { status: 400 },
    );
  }
}
