import { NextResponse } from "next/server";

import type { ApiErrorShape, SkillSetProjectReAddResult } from "../../../../../../../shared/contracts";
import { createApiError } from "../../../../../../lib/api-error";
import { reAddSkillSetTasksToProject } from "../../../../../../lib/skill-set-project-readd";

interface ReAddSkillSetBody {
  instructionSetId?: string;
  subprojectId?: string | null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;

  let body: ReAddSkillSetBody;
  try {
    body = (await request.json()) as ReAddSkillSetBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.instructionSetId !== "string" || body.instructionSetId.trim().length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `instructionSetId` is required"),
      { status: 400 },
    );
  }

  try {
    const result = await reAddSkillSetTasksToProject({
      instructionSetId: body.instructionSetId,
      projectId,
      subprojectId: body.subprojectId,
    });
    return NextResponse.json<SkillSetProjectReAddResult>(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_SET_READD_FAILED", "Failed to re-add skill set", message),
      { status: 400 },
    );
  }
}
