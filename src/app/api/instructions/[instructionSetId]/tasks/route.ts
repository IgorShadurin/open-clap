import type { NextResponse } from "next/server";

import { POST as createSkillSetTask } from "@/app/api/skills/[skillSetId]/tasks/route";

type LegacyCreateSkillTaskContext = {
  params: Promise<{ instructionSetId: string }>;
};

export async function POST(
  request: Request,
  context: LegacyCreateSkillTaskContext,
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  return createSkillSetTask(request, {
    params: Promise.resolve({ skillSetId: instructionSetId }),
  });
}
