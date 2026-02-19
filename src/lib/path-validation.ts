import fs from "node:fs/promises";
import path from "node:path";

import type { ValidatePathResponse } from "../../shared/contracts/path";

export function normalizeUserPath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error("Path is required");
  }

  const resolved = path.resolve(trimmed);
  return path.normalize(resolved);
}

export async function validatePathExists(
  inputPath: string,
): Promise<ValidatePathResponse> {
  const normalizedPath = normalizeUserPath(inputPath);

  try {
    const stat = await fs.stat(normalizedPath);
    return {
      exists: true,
      isDirectory: stat.isDirectory(),
      normalizedPath,
    };
  } catch {
    return {
      exists: false,
      isDirectory: false,
      normalizedPath,
    };
  }
}
