import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../../shared/contracts";
import { createApiError } from "../../../../../../lib/api-error";
import { setSkillTaskAction } from "../../../../../../lib/skills-service";

interface SkillTaskActionBody {
  action: "pause" | "remove" | "resume";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await context.params;
  let body: SkillTaskActionBody;
  try {
    body = (await request.json()) as SkillTaskActionBody;
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
    await setSkillTaskAction(taskId, body.action);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SKILL_TASK_ACTION_FAILED",
        "Failed to update skill task action",
        message,
      ),
      { status: 400 },
    );
  }
}
