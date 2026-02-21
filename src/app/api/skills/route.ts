import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  SkillSetEntity,
  SkillSetTreeItem,
} from "../../../../shared/contracts";
import { createApiError } from "../../../lib/api-error";
import {
  createSkillSet,
  listSkillSetsTree,
} from "../../../lib/skills-service";

interface CreateSkillSetBody {
  description?: string;
  name: string;
}

export async function GET(): Promise<NextResponse> {
  const sets = await listSkillSetsTree();
  return NextResponse.json<SkillSetTreeItem[]>(sets, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CreateSkillSetBody;
  try {
    body = (await request.json()) as CreateSkillSetBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_SET_CREATE_FAILED", "Failed to create skill set", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.name !== "string" || body.name.trim().length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `name` is required"),
      { status: 400 },
    );
  }

  try {
    const set = await createSkillSet({
      description: body.description,
      name: body.name,
    });
    return NextResponse.json<SkillSetEntity>(set, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_SET_CREATE_FAILED", "Failed to create skill set", message),
      { status: 400 },
    );
  }
}
