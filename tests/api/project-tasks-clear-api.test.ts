import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { DELETE as clearProjectTasks } from "../../src/app/api/projects/[projectId]/tasks/route";
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

test("DELETE /api/projects/:projectId/tasks removes all project tasks", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Tasks to Clear Project",
      path: "/tmp/tasks-to-clear",
      priority: 0,
    },
    select: { id: true },
  });

  const subproject = await prisma.subproject.create({
    data: {
      name: "Subproject Tasks to Clear",
      path: "/tmp/tasks-to-clear/sub",
      priority: 0,
      projectId: project.id,
      paused: false,
    },
    select: { id: true },
  });

  await prisma.task.createMany({
    data: [
      {
        projectId: project.id,
        text: "Main task",
      },
      {
        projectId: project.id,
        text: "Subproject task",
        subprojectId: subproject.id,
      },
    ],
  });

  const clearResponse = await clearProjectTasks(
    new Request(`http://localhost/api/projects/${project.id}/tasks`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(clearResponse.status, 204);

  const remainingTasks = await prisma.task.findMany({
    where: { projectId: project.id },
  });
  assert.equal(remainingTasks.length, 0);

  const remainingSubprojects = await prisma.subproject.findMany({
    where: { projectId: project.id },
  });
  assert.equal(remainingSubprojects.length, 1);
});
