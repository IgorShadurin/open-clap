import fs from "node:fs/promises";
import path from "node:path";

import type { PathSortMode } from "../../shared/contracts";

export interface PathDirectoryEntry {
  modifiedAt: string;
  name: string;
  path: string;
}

export interface ListDirectoriesOptions {
  basePath: string;
  sort: PathSortMode;
}

export async function listDirectories(
  options: ListDirectoriesOptions,
): Promise<PathDirectoryEntry[]> {
  const normalizedBasePath = path.normalize(path.resolve(options.basePath));
  const entries = await fs.readdir(normalizedBasePath, { withFileTypes: true });

  const directories: PathDirectoryEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(normalizedBasePath, entry.name);
    const stat = await fs.stat(entryPath);

    directories.push({
      modifiedAt: stat.mtime.toISOString(),
      name: entry.name,
      path: entryPath,
    });
  }

  if (options.sort === "name") {
    directories.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  } else {
    directories.sort(
      (left, right) =>
        new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime(),
    );
  }

  return directories;
}
