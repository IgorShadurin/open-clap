import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";

export const runtime = "nodejs";

const IMAGE_FILE_NAME_PATTERN =
  /\.(apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i;
const ATTACHMENTS_DIRECTORY = path.join(process.cwd(), "data", "task-attachments");

function sanitizeName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "-");
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized.length > 0 ? sanitized : "image";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isImageFile(file: File): boolean {
  return file.type.toLowerCase().startsWith("image/") || IMAGE_FILE_NAME_PATTERN.test(file.name);
}

function resolveFileExtension(file: File): string {
  const extensionFromName = path.extname(file.name).trim();
  if (extensionFromName.length > 0) {
    return extensionFromName.toLowerCase();
  }

  if (file.type === "image/png") {
    return ".png";
  }

  if (file.type === "image/jpeg") {
    return ".jpg";
  }

  if (file.type === "image/webp") {
    return ".webp";
  }

  if (file.type === "image/gif") {
    return ".gif";
  }

  return ".img";
}

export async function POST(request: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Request body must be multipart/form-data"),
      { status: 400 },
    );
  }

  const allEntries = formData.getAll("files");
  const droppedFiles = allEntries.filter((entry): entry is File => entry instanceof File);
  if (droppedFiles.length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "At least one image file is required in `files`"),
      { status: 400 },
    );
  }

  const imagesOnly = droppedFiles.filter((file) => isImageFile(file));
  if (imagesOnly.length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Dropped files do not contain supported image types"),
      { status: 400 },
    );
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const storageDirectory = path.join(ATTACHMENTS_DIRECTORY, year, month, day);
  await fs.mkdir(storageDirectory, { recursive: true });

  const savedPaths: string[] = [];
  for (const file of imagesOnly) {
    const safeBaseName = sanitizeName(path.basename(file.name, path.extname(file.name)));
    const extension = resolveFileExtension(file);
    const fileName = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}-${safeBaseName}${extension}`;
    const absoluteTargetPath = path.join(storageDirectory, fileName);

    const content = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absoluteTargetPath, content);
    savedPaths.push(absoluteTargetPath);
  }

  return NextResponse.json({ paths: savedPaths }, { status: 200 });
}
