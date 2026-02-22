import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { POST as createProjectTask } from "../../src/app/api/tasks/route";
import { POST as createSkillTask } from "../../src/app/api/skills/[skillSetId]/tasks/route";
import { prisma } from "../../src/lib/prisma";

async function resetDatabase(): Promise<void> {
  await prisma.taskStatusUpdate.deleteMany();
  await prisma.taskResponse.deleteMany();
  await prisma.taskExecution.deleteMany();
  await prisma.immediateAction.deleteMany();
  await prisma.task.deleteMany();
  await prisma.subproject.deleteMany();
  await prisma.project.deleteMany();

  await prisma.skillTask.deleteMany();
  await prisma.skillSet.deleteMany();
}

test.after(async () => {
  await resetDatabase();
});

test("POST /api/tasks creates duplicate project tasks when duplicateCount > 1", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Duplicate task project",
      path: "/tmp/duplicate-task-project",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createProjectTask(
    new Request("http://localhost/api/tasks", {
      body: JSON.stringify({
        duplicateCount: 3,
        includePreviousContext: true,
        model: "gpt-5.3-codex-spark",
        previousContextMessages: 2,
        projectId: project.id,
        reasoning: "high",
        text: "Run integration checks",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(createResponse.status, 201);

  const created = (await createResponse.json()) as { id: string };
  assert.ok(created.id.length > 0);

  const tasks = await prisma.task.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    where: { projectId: project.id },
  });
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].id, created.id);
  assert.ok(tasks.every((task) => task.text === "Run integration checks"));
});

test("POST /api/skills/:skillSetId/tasks creates duplicate skill tasks when duplicateCount > 1", async () => {
  await resetDatabase();

  const skillSet = await prisma.skillSet.create({
    data: {
      name: "Duplicate skill set",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createSkillTask(
    new Request(`http://localhost/api/skills/${skillSet.id}/tasks`, {
      body: JSON.stringify({
        duplicateCount: 4,
        includePreviousContext: false,
        model: "gpt-5.3-codex-spark",
        reasoning: "medium",
        text: "Summarize repository changes",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ skillSetId: skillSet.id }) },
  );
  assert.equal(createResponse.status, 201);

  const created = (await createResponse.json()) as { id: string };
  assert.ok(created.id.length > 0);

  const skillTasks = await prisma.skillTask.findMany({
    where: { instructionSetId: skillSet.id },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  assert.equal(skillTasks.length, 4);
  assert.ok(skillTasks.every((task) => task.text === "Summarize repository changes"));
  assert.equal(skillTasks[0].id, created.id);
});
