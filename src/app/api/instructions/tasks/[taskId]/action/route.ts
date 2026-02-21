import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../../shared/contracts";
import { createApiError } from "../../../../../../lib/api-error";
import { setInstructionTaskAction } from "../../../../../../lib/instructions-service";

interface InstructionTaskActionBody {
  action: "pause" | "remove" | "resume";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await context.params;
  let body: InstructionTaskActionBody;
  try {
    body = (await request.json()) as InstructionTaskActionBody;
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
    await setInstructionTaskAction(taskId, body.action);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INSTRUCTION_TASK_ACTION_FAILED",
        "Failed to update instruction task action",
        message,
      ),
      { status: 400 },
    );
  }
}
