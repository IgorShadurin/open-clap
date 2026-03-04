import { access, readdir, stat } from "node:fs/promises";
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

async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    const directory = await stat(directoryPath);
    return directory.isDirectory();
  } catch {
    return false;
  }
}

function scoreXcodeIconFileName(fileName: string): number {
  const lowerCasedFileName = fileName.toLowerCase();
  if (!lowerCasedFileName.endsWith(".png")) {
    return -1;
  }

  let score = 0;
  if (lowerCasedFileName.includes("1024")) {
    score += 1_000_000;
  }

  const numericMatches = lowerCasedFileName.match(/\d+(?:\.\d+)?/g) ?? [];
  let largestNumericToken = 0;
  for (const rawToken of numericMatches) {
    const parsedToken = Number.parseFloat(rawToken);
    if (Number.isFinite(parsedToken)) {
      largestNumericToken = Math.max(largestNumericToken, parsedToken);
    }
  }
  score += Math.round(largestNumericToken * 1_000);

  if (lowerCasedFileName.includes("@3x")) {
    score += 300;
  } else if (lowerCasedFileName.includes("@2x")) {
    score += 200;
  } else if (lowerCasedFileName.includes("@1x")) {
    score += 100;
  }

  return score;
}

async function resolveXcodeAppIconPath(projectPath: string): Promise<string | null> {
  const normalizedProjectPath = path.resolve(projectPath);
  const iconSetDirectories = [
    path.join(normalizedProjectPath, "Assets.xcassets", "AppIcon.appiconset"),
  ];

  try {
    const projectDirectoryEntries = await readdir(normalizedProjectPath, {
      withFileTypes: true,
    });
    const childDirectories = projectDirectoryEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    for (const childDirectory of childDirectories) {
      iconSetDirectories.push(
        path.join(
          normalizedProjectPath,
          childDirectory,
          "Assets.xcassets",
          "AppIcon.appiconset",
        ),
      );
    }
  } catch {
    return null;
  }

  let bestIconPath: string | null = null;
  let bestIconScore = -1;

  for (const iconSetDirectory of iconSetDirectories) {
    if (!(await directoryExists(iconSetDirectory))) {
      continue;
    }

    let iconEntries;
    try {
      iconEntries = await readdir(iconSetDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const iconEntry of iconEntries) {
      if (!iconEntry.isFile()) {
        continue;
      }
      const iconScore = scoreXcodeIconFileName(iconEntry.name);
      if (iconScore < 0 || iconScore <= bestIconScore) {
        continue;
      }

      const iconPath = path.join(iconSetDirectory, iconEntry.name);
      if (!(await fileExists(iconPath))) {
        continue;
      }

      bestIconPath = iconPath;
      bestIconScore = iconScore;
    }
  }

  return bestIconPath;
}

export async function resolveProjectPngIconPath(projectPath: string): Promise<string | null> {
  const normalizedProjectPath = path.resolve(projectPath);

  for (const relativeCandidate of PROJECT_ICON_CANDIDATE_PATHS) {
    const absoluteCandidatePath = path.join(normalizedProjectPath, relativeCandidate);
    if (await fileExists(absoluteCandidatePath)) {
      return absoluteCandidatePath;
    }
  }

  const xcodeIconPath = await resolveXcodeAppIconPath(normalizedProjectPath);
  if (xcodeIconPath) {
    return xcodeIconPath;
  }

  return null;
}
