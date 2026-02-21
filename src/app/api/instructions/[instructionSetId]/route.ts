import type { NextResponse } from "next/server";

import {
  DELETE as deleteSkillSet,
  GET as getSkillSetById,
  PATCH as patchSkillSet,
} from "@/app/api/skills/[skillSetId]/route";

type LegacySkillSetContext = {
  params: Promise<{ instructionSetId: string }>;
};

export async function GET(
  request: Request,
  context: LegacySkillSetContext,
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  return getSkillSetById(request, { params: Promise.resolve({ skillSetId: instructionSetId }) });
}

export async function PATCH(
  request: Request,
  context: LegacySkillSetContext,
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  return patchSkillSet(request, { params: Promise.resolve({ skillSetId: instructionSetId }) });
}

export async function DELETE(
  request: Request,
  context: LegacySkillSetContext,
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  return deleteSkillSet(request, { params: Promise.resolve({ skillSetId: instructionSetId }) });
}
