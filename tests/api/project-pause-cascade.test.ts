import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { PATCH as projectPatch } from "../../src/app/api/projects/[projectId]/route";
import { prisma } from "../../src/lib/prisma";

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
});

test("project pause/resume cascades to all subprojects", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Cascade Project",
      path: "/tmp",
      paused: false,
      priority: 0,
    },
    select: { id: true },
  });

  await prisma.subproject.createMany({
    data: [
      {
        name: "Sub One",
        path: "/tmp/sub-one",
        paused: false,
        priority: 0,
        projectId: project.id,
      },
      {
        name: "Sub Two",
        path: "/tmp/sub-two",
        paused: false,
        priority: 1,
        projectId: project.id,
      },
    ],
  });

  const pauseResponse = await projectPatch(
    new Request(`http://localhost/api/projects/${project.id}`, {
      body: JSON.stringify({ paused: true }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(pauseResponse.status, 200);

  const pausedProject = await prisma.project.findUnique({
    select: { paused: true },
    where: { id: project.id },
  });
  const pausedSubprojects = await prisma.subproject.findMany({
    select: { paused: true },
    where: { projectId: project.id },
  });

  assert.equal(pausedProject?.paused, true);
  assert.equal(pausedSubprojects.every((item) => item.paused), true);

  const resumeResponse = await projectPatch(
    new Request(`http://localhost/api/projects/${project.id}`, {
      body: JSON.stringify({ paused: false }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(resumeResponse.status, 200);

  const resumedProject = await prisma.project.findUnique({
    select: { paused: true },
    where: { id: project.id },
  });
  const resumedSubprojects = await prisma.subproject.findMany({
    select: { paused: true },
    where: { projectId: project.id },
  });

  assert.equal(resumedProject?.paused, false);
  assert.equal(resumedSubprojects.every((item) => !item.paused), true);
});
