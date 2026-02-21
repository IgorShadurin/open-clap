import type { NextResponse } from "next/server";

import {
  DELETE as deleteImage,
  GET as getImage,
  POST as postImage,
} from "@/app/api/skills/[skillSetId]/image/route";

type LegacyImageContext = {
  params: Promise<{ instructionSetId: string }>;
};

export async function GET(
  request: Request,
  context: LegacyImageContext,
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  return getImage(request, { params: Promise.resolve({ skillSetId: instructionSetId }) });
}

export async function POST(
  request: Request,
  context: LegacyImageContext,
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  return postImage(request, { params: Promise.resolve({ skillSetId: instructionSetId }) });
}

export async function DELETE(
  request: Request,
  context: LegacyImageContext,
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  return deleteImage(request, { params: Promise.resolve({ skillSetId: instructionSetId }) });
}
