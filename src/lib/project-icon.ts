import { access, stat } from "node:fs/promises";
import path from "node:path";

const PROJECT_ICON_CANDIDATE_PATHS = [
  "public/icons/android-chrome-512x512.png",
  "public/android-chrome-512x512.png",
  "public/icons/favicon-512x512.png",
  "public/favicon-512x512.png",
  "public/icons/icon-512x512.png",
  "public/icon-512x512.png",
  "public/source-icons/icon-512.png",
  "public/icons/apple-touch-icon.png",
  "public/apple-touch-icon.png",
  "public/icons/android-chrome-192x192.png",
  "public/android-chrome-192x192.png",
  "public/icons/favicon-192x192.png",
  "public/favicon-192x192.png",
  "public/icons/icon-192x192.png",
  "public/icon-192x192.png",
  "public/icons/favicon.png",
  "public/favicon.png",
  "app/icon.png",
  "src/app/icon.png",
] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    const file = await stat(filePath);
    return file.isFile();
  } catch {
    return false;
  }
}

export async function resolveProjectPngIconPath(projectPath: string): Promise<string | null> {
  const normalizedProjectPath = path.resolve(projectPath);

  for (const relativeCandidate of PROJECT_ICON_CANDIDATE_PATHS) {
    const absoluteCandidatePath = path.join(normalizedProjectPath, relativeCandidate);
    if (await fileExists(absoluteCandidatePath)) {
      return absoluteCandidatePath;
    }
  }

  return null;
}
