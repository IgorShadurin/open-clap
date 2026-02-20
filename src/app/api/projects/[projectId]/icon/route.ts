import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import {
  getProjectIconInfoById,
  setProjectIconPath,
} from "../../../../../lib/entities-service";
import { resolveProjectPngIconPath } from "../../../../../lib/project-icon";
import {
  isImageFile,
  removeUploadedProjectIcon,
  resolveImageContentType,
  saveUploadedProjectIcon,
} from "../../../../../lib/project-uploaded-icon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;
  const project = await getProjectIconInfoById(projectId);

  if (!project) {
    return new NextResponse(null, { status: 404 });
  }

  const uploadedIconPath = project.iconPath?.trim() || null;
  if (uploadedIconPath) {
    try {
      const icon = await readFile(uploadedIconPath);
      return new NextResponse(icon, {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
          "Content-Type": resolveImageContentType(uploadedIconPath),
        },
        status: 200,
      });
    } catch {
      // Fall through to project path icon resolution.
    }
  }

  const iconPath = await resolveProjectPngIconPath(project.path);
  if (!iconPath) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const icon = await readFile(iconPath);
    return new NextResponse(icon, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        "Content-Type": resolveImageContentType(iconPath),
      },
      status: 200,
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;
  const project = await getProjectIconInfoById(projectId);
  if (!project) {
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

  const previousIconPath = project.iconPath?.trim() || null;

  try {
    const savedIconPath = await saveUploadedProjectIcon(projectId, fileEntry);
    await setProjectIconPath(projectId, savedIconPath);

    if (previousIconPath && previousIconPath !== savedIconPath) {
      await removeUploadedProjectIcon(previousIconPath);
    }

    return NextResponse.json({ iconPath: savedIconPath }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PROJECT_ICON_UPLOAD_FAILED", "Failed to upload project icon", message),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;
  const project = await getProjectIconInfoById(projectId);
  if (!project) {
    return new NextResponse(null, { status: 404 });
  }

  const iconPath = project.iconPath?.trim() || null;
  if (!iconPath) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "PROJECT_ICON_DELETE_FAILED",
        "Only uploaded project icons can be deleted",
      ),
      { status: 400 },
    );
  }

  try {
    await removeUploadedProjectIcon(iconPath);
    await setProjectIconPath(projectId, null);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PROJECT_ICON_DELETE_FAILED", "Failed to delete project icon", message),
      { status: 400 },
    );
  }
}
