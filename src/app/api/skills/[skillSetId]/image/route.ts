import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import {
  getSkillSetImageInfoById,
  setSkillSetImagePath,
} from "../../../../../lib/skills-service";
import {
  isImageFile,
  removeUploadedInstructionSetImage,
  resolveImageContentType,
  saveUploadedInstructionSetImage,
} from "../../../../../lib/skill-set-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ skillSetId: string }> },
): Promise<NextResponse> {
  const { skillSetId } = await context.params;
  const set = await getSkillSetImageInfoById(skillSetId);
  if (!set) {
    return new NextResponse(null, { status: 404 });
  }

  const imagePath = set.imagePath?.trim() || null;
  if (!imagePath) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const image = await readFile(imagePath);
    return new NextResponse(image, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        "Content-Type": resolveImageContentType(imagePath),
      },
      status: 200,
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ skillSetId: string }> },
): Promise<NextResponse> {
  const { skillSetId } = await context.params;
  const set = await getSkillSetImageInfoById(skillSetId);
  if (!set) {
    return new NextResponse(null, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Request body must be multipart/form-data"),
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `file` is required"),
      { status: 400 },
    );
  }

  if (!isImageFile(fileEntry)) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Uploaded file must be an image"),
      { status: 400 },
    );
  }

  const previousImagePath = set.imagePath?.trim() || null;

  try {
    const savedPath = await saveUploadedInstructionSetImage(skillSetId, fileEntry);
    await setSkillSetImagePath(skillSetId, savedPath);

    if (previousImagePath && previousImagePath !== savedPath) {
      await removeUploadedInstructionSetImage(previousImagePath);
    }

    return NextResponse.json({ imagePath: savedPath }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SKILL_SET_IMAGE_UPLOAD_FAILED",
        "Failed to upload skill set image",
        message,
      ),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ skillSetId: string }> },
): Promise<NextResponse> {
  const { skillSetId } = await context.params;
  const set = await getSkillSetImageInfoById(skillSetId);
  if (!set) {
    return new NextResponse(null, { status: 404 });
  }

  const imagePath = set.imagePath?.trim() || null;
  if (!imagePath) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("SKILL_SET_IMAGE_DELETE_FAILED", "Skill set image is not configured"),
      { status: 400 },
    );
  }

  try {
    await removeUploadedInstructionSetImage(imagePath);
    await setSkillSetImagePath(skillSetId, null);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SKILL_SET_IMAGE_DELETE_FAILED",
        "Failed to delete skill set image",
        message,
      ),
      { status: 400 },
    );
  }
}
