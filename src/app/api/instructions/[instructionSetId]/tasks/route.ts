import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  InstructionTaskEntity,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { createInstructionTask } from "../../../../../lib/instructions-service";

interface CreateInstructionTaskBody {
  includePreviousContext?: boolean;
  model?: string;
  previousContextMessages?: number;
  reasoning?: string;
  text: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ instructionSetId: string }> },
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  let body: CreateInstructionTaskBody;
  try {
    body = (await request.json()) as CreateInstructionTaskBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.text !== "string" || body.text.trim().length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `text` is required"),
      { status: 400 },
    );
  }

  try {
    const task = await createInstructionTask({
      includePreviousContext: body.includePreviousContext,
      instructionSetId,
      model: body.model,
      previousContextMessages: body.previousContextMessages,
      reasoning: body.reasoning,
      text: body.text,
    });
    return NextResponse.json<InstructionTaskEntity>(task, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INSTRUCTION_TASK_CREATE_FAILED",
        "Failed to create instruction task",
        message,
      ),
      { status: 400 },
    );
  }
}
