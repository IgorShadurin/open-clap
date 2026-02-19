import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PATCH as subprojectPatch } from "../../src/app/api/subprojects/[subprojectId]/route";
import { POST as subprojectPost } from "../../src/app/api/subprojects/route";
import { prisma } from "../../src/lib/prisma";

interface ApiErrorResponse {
  details?: string;
  error: {
    code: string;
    message: string;
  };
}

const tempDirs: string[] = [];

async function createTempProjectPaths(): Promise<{
  projectPath: string;
  subPathOne: string;
  subPathTwo: string;
}> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclap-subproject-path-"));
  tempDirs.push(rootDir);
  const projectPath = path.join(rootDir, "project");
  const subPathOne = path.join(rootDir, "sub-one");
  const subPathTwo = path.join(rootDir, "sub-two");
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(subPathOne, { recursive: true });
  await fs.mkdir(subPathTwo, { recursive: true });
  return { projectPath, subPathOne, subPathTwo };
}

async function resetDatabase(): Promise<void> {
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

test("cannot create subproject using the same directory as project", async () => {
  await resetDatabase();
  const paths = await createTempProjectPaths();

  const project = await prisma.project.create({
    data: {
      name: "Path Guard Project",
      path: paths.projectPath,
      priority: 0,
    },
    select: { id: true },
  });

  const response = await subprojectPost(
    new Request("http://localhost/api/subprojects", {
      body: JSON.stringify({
        name: "Sub Same Path",
        path: paths.projectPath,
        projectId: project.id,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 400);
  const payload = (await response.json()) as ApiErrorResponse;
  assert.match(payload.details ?? "", /different from project path/i);
});

test("cannot create subproject using a directory already used by sibling subproject", async () => {
  await resetDatabase();
  const paths = await createTempProjectPaths();

  const project = await prisma.project.create({
    data: {
      name: "Sibling Path Project",
      path: paths.projectPath,
      priority: 0,
    },
    select: { id: true },
  });

  await prisma.subproject.create({
    data: {
      name: "Existing Sub",
      path: paths.subPathOne,
      priority: 0,
      projectId: project.id,
    },
  });

  const response = await subprojectPost(
    new Request("http://localhost/api/subprojects", {
      body: JSON.stringify({
        name: "Duplicate Path Sub",
        path: paths.subPathOne,
        projectId: project.id,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 400);
  const payload = (await response.json()) as ApiErrorResponse;
  assert.match(payload.details ?? "", /already used in this project/i);
});

test("cannot update subproject path to project or sibling directory", async () => {
  await resetDatabase();
  const paths = await createTempProjectPaths();

  const project = await prisma.project.create({
    data: {
      name: "Update Guard Project",
      path: paths.projectPath,
      priority: 0,
    },
    select: { id: true },
  });

  const subOne = await prisma.subproject.create({
    data: {
      name: "Sub One",
      path: paths.subPathOne,
      priority: 0,
      projectId: project.id,
    },
    select: { id: true },
  });
  const subTwo = await prisma.subproject.create({
    data: {
      name: "Sub Two",
      path: paths.subPathTwo,
      priority: 1,
      projectId: project.id,
    },
    select: { id: true },
  });

  const projectPathResponse = await subprojectPatch(
    new Request(`http://localhost/api/subprojects/${subOne.id}`, {
      body: JSON.stringify({ path: paths.projectPath }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ subprojectId: subOne.id }) },
  );

  assert.equal(projectPathResponse.status, 400);

  const siblingPathResponse = await subprojectPatch(
    new Request(`http://localhost/api/subprojects/${subOne.id}`, {
      body: JSON.stringify({ path: paths.subPathTwo }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ subprojectId: subOne.id }) },
  );

  assert.equal(siblingPathResponse.status, 400);
  const payload = (await siblingPathResponse.json()) as ApiErrorResponse;
  assert.match(payload.details ?? "", /already used in this project/i);

  const untouched = await prisma.subproject.findUnique({
    select: { path: true },
    where: { id: subTwo.id },
  });
  assert.equal(untouched?.path, paths.subPathTwo);
});
