import { promises as fs } from "node:fs";
import path from "node:path";

const IMAGE_FILE_NAME_PATTERN =
  /\.(apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i;

function getProjectIconsDirectory(): string {
  return path.join(process.cwd(), "data", "project-icons", "projects");
}

function sanitizeProjectId(projectId: string): string {
  const normalized = projectId.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return normalized.length > 0 ? normalized : "project";
}

function normalizeExtension(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return ".img";
  }

  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

export function isImageFile(file: File): boolean {
  const normalizedType = file.type.toLowerCase();
  return normalizedType.startsWith("image/") || IMAGE_FILE_NAME_PATTERN.test(file.name);
}

export function resolveImageFileExtension(file: File): string {
  const extensionFromName = path.extname(file.name).trim();
  if (extensionFromName.length > 0) {
    return normalizeExtension(extensionFromName);
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

  if (file.type === "image/svg+xml") {
    return ".svg";
  }

  return ".img";
}

function isPathWithinProjectIconsDirectory(filePath: string): boolean {
  const projectIconsDirectory = getProjectIconsDirectory();
  const resolvedDirectory = path.resolve(projectIconsDirectory);
  const resolvedFilePath = path.resolve(filePath);
  return (
    resolvedFilePath === resolvedDirectory ||
    resolvedFilePath.startsWith(`${resolvedDirectory}${path.sep}`)
  );
}

export async function saveUploadedProjectIcon(projectId: string, file: File): Promise<string> {
  const projectIconsDirectory = getProjectIconsDirectory();
  const safeProjectId = sanitizeProjectId(projectId);
  const extension = resolveImageFileExtension(file);

  await fs.mkdir(projectIconsDirectory, { recursive: true });

  const existingEntries = await fs.readdir(projectIconsDirectory, { withFileTypes: true });
  await Promise.all(
    existingEntries
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${safeProjectId}.`))
      .map((entry) => fs.rm(path.join(projectIconsDirectory, entry.name), { force: true })),
  );

  const targetPath = path.join(projectIconsDirectory, `${safeProjectId}${extension}`);
  const content = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(targetPath, content);
  return targetPath;
}

export async function removeUploadedProjectIcon(iconPath: string): Promise<boolean> {
  if (!isPathWithinProjectIconsDirectory(iconPath)) {
    return false;
  }

  await fs.rm(iconPath, { force: true });
  return true;
}

export function resolveImageContentType(iconPath: string): string {
  const extension = path.extname(iconPath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  if (extension === ".bmp") {
    return "image/bmp";
  }

  if (extension === ".avif") {
    return "image/avif";
  }

  if (extension === ".tif" || extension === ".tiff") {
    return "image/tiff";
  }

  return "application/octet-stream";
}
