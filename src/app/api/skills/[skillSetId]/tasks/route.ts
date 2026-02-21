import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  SkillTaskEntity,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { createSkillSetTask } from "../../../../../lib/skills-service";

interface CreateSkillTaskBody {
  includePreviousContext?: boolean;
  model?: string;
  previousContextMessages?: number;
  reasoning?: string;
  text: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ skillSetId: string }> },
): Promise<NextResponse> {
  const { skillSetId } = await context.params;
  let body: CreateSkillTaskBody;
  try {
    body = (await request.json()) as CreateSkillTaskBody;
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
    const task = await createSkillSetTask({
      includePreviousContext: body.includePreviousContext,
      instructionSetId: skillSetId,
      model: body.model,
      previousContextMessages: body.previousContextMessages,
      reasoning: body.reasoning,
      text: body.text,
    });
    return NextResponse.json<SkillTaskEntity>(task, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SKILL_TASK_CREATE_FAILED",
        "Failed to create skill task",
        message,
      ),
      { status: 400 },
    );
  }
}
