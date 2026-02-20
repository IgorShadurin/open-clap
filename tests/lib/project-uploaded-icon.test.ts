import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isImageFile,
  removeUploadedProjectIcon,
  resolveImageContentType,
  saveUploadedProjectIcon,
} from "../../src/lib/project-uploaded-icon";

const originalCwd = process.cwd();

async function withTempCwd(run: (cwd: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "project-uploaded-icon-test-"));

  process.chdir(tempDir);
  try {
    await run(tempDir);
  } finally {
    process.chdir(originalCwd);
    await rm(tempDir, { force: true, recursive: true });
  }
}

test("saveUploadedProjectIcon stores icons in data/project-icons/projects and replaces previous extension", async () => {
  await withTempCwd(async () => {
    const projectId = "project_alpha";
    const firstIcon = new File(["first"], "icon.png", { type: "image/png" });
    const secondIcon = new File(["second"], "icon.webp", { type: "image/webp" });
    const expectedDirectory = path.join(process.cwd(), "data", "project-icons", "projects");

    const firstPath = await saveUploadedProjectIcon(projectId, firstIcon);
    assert.equal(firstPath, path.join(expectedDirectory, "project_alpha.png"));

    const secondPath = await saveUploadedProjectIcon(projectId, secondIcon);
    assert.equal(secondPath, path.join(expectedDirectory, "project_alpha.webp"));

    await assert.rejects(() => stat(firstPath));
    const secondContent = await readFile(secondPath, "utf8");
    assert.equal(secondContent, "second");
  });
});

test("removeUploadedProjectIcon only deletes files inside project icon storage", async () => {
  await withTempCwd(async (cwd) => {
    const savedPath = await saveUploadedProjectIcon(
      "project_beta",
      new File(["image"], "icon.jpg", { type: "image/jpeg" }),
    );

    assert.equal(await removeUploadedProjectIcon(savedPath), true);
    await assert.rejects(() => stat(savedPath));

    const outsidePath = path.join(cwd, "outside.png");
    assert.equal(await removeUploadedProjectIcon(outsidePath), false);
  });
});

test("image helpers validate files and resolve content types", () => {
  assert.equal(isImageFile(new File(["a"], "a.txt", { type: "text/plain" })), false);
  assert.equal(isImageFile(new File(["a"], "a.svg", { type: "" })), true);

  assert.equal(resolveImageContentType("/tmp/icon.png"), "image/png");
  assert.equal(resolveImageContentType("/tmp/icon.jpeg"), "image/jpeg");
  assert.equal(resolveImageContentType("/tmp/icon.webp"), "image/webp");
});
