import { promises as fs } from "node:fs";
import path from "node:path";

import {
  isImageFile,
  resolveImageContentType,
  resolveImageFileExtension,
} from "./project-uploaded-icon";

function getInstructionSetImagesDirectory(): string {
  return path.join(process.cwd(), "data", "instruction-set-images", "sets");
}

function sanitizeInstructionSetId(instructionSetId: string): string {
  const normalized = instructionSetId.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return normalized.length > 0 ? normalized : "instruction-set";
}

function isPathWithinInstructionSetImagesDirectory(filePath: string): boolean {
  const instructionSetImagesDirectory = getInstructionSetImagesDirectory();
  const resolvedDirectory = path.resolve(instructionSetImagesDirectory);
  const resolvedFilePath = path.resolve(filePath);
  return (
    resolvedFilePath === resolvedDirectory ||
    resolvedFilePath.startsWith(`${resolvedDirectory}${path.sep}`)
  );
}

export { isImageFile, resolveImageContentType };

export async function saveUploadedInstructionSetImage(
  instructionSetId: string,
  file: File,
): Promise<string> {
  const instructionSetImagesDirectory = getInstructionSetImagesDirectory();
  const safeInstructionSetId = sanitizeInstructionSetId(instructionSetId);
  const extension = resolveImageFileExtension(file);

  await fs.mkdir(instructionSetImagesDirectory, { recursive: true });

  const existingEntries = await fs.readdir(instructionSetImagesDirectory, {
    withFileTypes: true,
  });
  await Promise.all(
    existingEntries
      .filter(
        (entry) => entry.isFile() && entry.name.startsWith(`${safeInstructionSetId}.`),
      )
      .map((entry) =>
        fs.rm(path.join(instructionSetImagesDirectory, entry.name), { force: true }),
      ),
  );

  const targetPath = path.join(
    instructionSetImagesDirectory,
    `${safeInstructionSetId}${extension}`,
  );
  const content = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(targetPath, content);
  return targetPath;
}

export async function removeUploadedInstructionSetImage(
  imagePath: string,
): Promise<boolean> {
  if (!isPathWithinInstructionSetImagesDirectory(imagePath)) {
    return false;
  }

  await fs.rm(imagePath, { force: true });
  return true;
}
