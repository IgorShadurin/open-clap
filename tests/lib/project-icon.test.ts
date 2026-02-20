import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveProjectPngIconPath } from "../../src/lib/project-icon";

async function withTempProjectDir(run: (projectDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "project-icon-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

test("resolveProjectPngIconPath returns null when no candidate PNG exists", async () => {
  await withTempProjectDir(async (projectDir) => {
    const iconPath = await resolveProjectPngIconPath(projectDir);
    assert.equal(iconPath, null);
  });
});

test("resolveProjectPngIconPath prefers public/icons apple-touch-icon.png over lower-priority candidates", async () => {
  await withTempProjectDir(async (projectDir) => {
    await mkdir(path.join(projectDir, "public", "icons"), { recursive: true });
    await mkdir(path.join(projectDir, "app"), { recursive: true });
    await writeFile(path.join(projectDir, "app", "icon.png"), "app-icon");
    await writeFile(
      path.join(projectDir, "public", "icons", "apple-touch-icon.png"),
      "public-icon",
    );

    const iconPath = await resolveProjectPngIconPath(projectDir);
    assert.equal(
      iconPath,
      path.join(projectDir, "public", "icons", "apple-touch-icon.png"),
    );
  });
});

test("resolveProjectPngIconPath prefers higher-quality 512 icon when available", async () => {
  await withTempProjectDir(async (projectDir) => {
    await mkdir(path.join(projectDir, "public", "icons"), { recursive: true });
    await writeFile(path.join(projectDir, "public", "icons", "apple-touch-icon.png"), "apple");
    await writeFile(
      path.join(projectDir, "public", "icons", "android-chrome-512x512.png"),
      "android-512",
    );

    const iconPath = await resolveProjectPngIconPath(projectDir);
    assert.equal(
      iconPath,
      path.join(projectDir, "public", "icons", "android-chrome-512x512.png"),
    );
  });
});

test("resolveProjectPngIconPath falls back to app icon when public icons are absent", async () => {
  await withTempProjectDir(async (projectDir) => {
    await mkdir(path.join(projectDir, "app"), { recursive: true });
    await writeFile(path.join(projectDir, "app", "icon.png"), "app-icon");

    const iconPath = await resolveProjectPngIconPath(projectDir);
    assert.equal(iconPath, path.join(projectDir, "app", "icon.png"));
  });
});
