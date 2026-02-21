import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  SkillSetEntity,
  SkillSetTreeItem,
} from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import {
  deleteSkillSet,
  getSkillSetById,
  updateSkillSet,
} from "../../../../lib/skills-service";

interface UpdateSkillSetBody {
  description?: string | null;
  mainPageTasksVisible?: boolean;
  linkedInstructionSetIds?: string[];
  name?: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ skillSetId: string }> },
): Promise<NextResponse> {
  const { skillSetId } = await context.params;
  const set = await getSkillSetById(skillSetId);
  if (!set) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json<SkillSetTreeItem>(set, { status: 200 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ skillSetId: string }> },
): Promise<NextResponse> {
  const { skillSetId } = await context.params;
  let body: UpdateSkillSetBody;
  try {
    body = (await request.json()) as UpdateSkillSetBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (
    body.linkedInstructionSetIds !== undefined &&
    !Array.isArray(body.linkedInstructionSetIds)
  ) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Field `linkedInstructionSetIds` must be an array of string IDs",
      ),
      { status: 400 },
    );
  }

  const hasInvalidLinkedId =
    body.linkedInstructionSetIds !== undefined &&
    !body.linkedInstructionSetIds.every((id) => typeof id === "string");
  if (hasInvalidLinkedId) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "All values in `linkedInstructionSetIds` must be strings",
      ),
      { status: 400 },
    );
  }

  try {
    const set = await updateSkillSet(skillSetId, body);
    return NextResponse.json<SkillSetEntity>(set, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_SET_UPDATE_FAILED", "Failed to update skill set", message),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ skillSetId: string }> },
): Promise<NextResponse> {
  const { skillSetId } = await context.params;
  try {
    await deleteSkillSet(skillSetId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_SET_DELETE_FAILED", "Failed to delete skill set", message),
      { status: 400 },
    );
  }
}
