import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ProjectEntity } from "../../shared/contracts";
import { POST as projectPost } from "../../src/app/api/projects/route";
import { prisma } from "../../src/lib/prisma";

const tempDirs: string[] = [];

async function createTempProjectPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-project-create-"));
  tempDirs.push(dir);
  return dir;
}

async function resetDatabase(): Promise<void> {
  await prisma.reusableListItem.deleteMany();
  await prisma.reusableList.deleteMany();
  await prisma.taskStatusUpdate.deleteMany();
  await prisma.taskResponse.deleteMany();
  await prisma.taskExecution.deleteMany();
  await prisma.immediateAction.deleteMany();
  await prisma.task.deleteMany();
  await prisma.subproject.deleteMany();
  await prisma.project.deleteMany();
}

test.after(async () => {
  await resetDatabase();
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

test("POST /api/projects creates project paused by default", async () => {
  await resetDatabase();
  const projectPath = await createTempProjectPath();

  const response = await projectPost(
    new Request("http://localhost/api/projects", {
      body: JSON.stringify({
        name: "Default Paused Project",
        path: projectPath,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 201);
  const created = (await response.json()) as ProjectEntity;
  assert.equal(created.paused, true);

  const saved = await prisma.project.findUnique({
    select: { paused: true },
    where: { id: created.id },
  });
  assert.equal(saved?.paused, true);
});
