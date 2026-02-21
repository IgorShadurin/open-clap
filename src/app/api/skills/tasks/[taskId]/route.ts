import { NextResponse } from "next/server";

import type { ApiErrorShape, SkillTaskEntity } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import {
  deleteSkillSetTask,
  updateSkillSetTask,
} from "../../../../../lib/skills-service";

interface UpdateSkillTaskBody {
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
  let body: UpdateSkillTaskBody;
  try {
    body = (await request.json()) as UpdateSkillTaskBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  try {
    const task = await updateSkillSetTask(taskId, body);
    return NextResponse.json<SkillTaskEntity>(task, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_TASK_UPDATE_FAILED", "Failed to update skill task", message),
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
    await deleteSkillSetTask(taskId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_TASK_DELETE_FAILED", "Failed to delete skill task", message),
      { status: 400 },
    );
  }
}
