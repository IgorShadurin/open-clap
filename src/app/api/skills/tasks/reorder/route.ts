import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { reorderSkillSetTasks } from "../../../../../lib/skills-service";

interface ReorderSkillTasksBody {
  instructionSetId?: string;
  skillSetId?: string;
  orderedIds: string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ReorderSkillTasksBody;
  try {
    body = (await request.json()) as ReorderSkillTasksBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  const instructionSetId = body.skillSetId ?? body.instructionSetId;
  if (!instructionSetId || !Array.isArray(body.orderedIds) || body.orderedIds.length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Fields `skillSetId` (or `instructionSetId`) and `orderedIds` are required",
      ),
      { status: 400 },
    );
  }

  try {
    await reorderSkillSetTasks(instructionSetId, body.orderedIds);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SKILL_TASK_REORDER_FAILED",
        "Failed to reorder skill tasks",
        message,
      ),
      { status: 400 },
    );
  }
}
