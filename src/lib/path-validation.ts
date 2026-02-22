import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import type { ValidatePathResponse } from "../../shared/contracts/path";

function removeOptionalQuotes(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function normalizeAbsolutePath(inputPath: string): string {
  const trimmed = removeOptionalQuotes(inputPath.trim());
  if (!trimmed) {
    throw new Error("Path is required");
  }

  if (/^file:\/\//i.test(trimmed)) {
    return fileURLToPath(trimmed);
  }

  if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }

  return trimmed;
}

export function normalizeUserPath(inputPath: string): string {
  const normalizedInput = normalizeAbsolutePath(inputPath);
  if (!normalizedInput) {
    throw new Error("Path is required");
  }

  const resolved = path.resolve(normalizedInput);
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
