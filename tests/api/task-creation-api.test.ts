import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { POST as createProjectTask } from "../../src/app/api/tasks/route";
import { POST as createSkillTask } from "../../src/app/api/skills/[skillSetId]/tasks/route";
import { prisma } from "../../src/lib/prisma";

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

test("POST /api/tasks rejects whitespace-only task text", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Whitespace project task",
      path: "/tmp/whitespace-project-task",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createProjectTask(
    new Request("http://localhost/api/tasks", {
      body: JSON.stringify({
        projectId: project.id,
        text: "   \n\t ",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(createResponse.status, 400);

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
  });
  assert.equal(tasks.length, 0);
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

test("POST /api/skills/:skillSetId/tasks rejects whitespace-only task text", async () => {
  await resetDatabase();

  const skillSet = await prisma.skillSet.create({
    data: {
      name: "Whitespace skill set",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createSkillTask(
    new Request(`http://localhost/api/skills/${skillSet.id}/tasks`, {
      body: JSON.stringify({
        text: "   \n\t ",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ skillSetId: skillSet.id }) },
  );
  assert.equal(createResponse.status, 400);

  const skillTasks = await prisma.skillTask.findMany({
    where: { instructionSetId: skillSet.id },
  });
  assert.equal(skillTasks.length, 0);
});

test("POST /api/tasks rejects unknown $list-* references", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Unknown list ref project",
      path: "/tmp/unknown-list-ref-project",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createProjectTask(
    new Request("http://localhost/api/tasks", {
      body: JSON.stringify({
        projectId: project.id,
        text: "Run for $list-country-codes",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(createResponse.status, 400);

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
  });
  assert.equal(tasks.length, 0);
});

test("POST /api/skills/:skillSetId/tasks rejects unknown $list-* references", async () => {
  await resetDatabase();

  const skillSet = await prisma.skillSet.create({
    data: {
      name: "Unknown list ref skill set",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createSkillTask(
    new Request(`http://localhost/api/skills/${skillSet.id}/tasks`, {
      body: JSON.stringify({
        text: "Run for $list-country-codes",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ skillSetId: skillSet.id }) },
  );
  assert.equal(createResponse.status, 400);

  const tasks = await prisma.skillTask.findMany({
    where: { instructionSetId: skillSet.id },
  });
  assert.equal(tasks.length, 0);
});

test("POST /api/tasks accepts known $list-* references", async () => {
  await resetDatabase();

  await prisma.reusableList.create({
    data: {
      id: "country-codes",
      items: {
        create: [
          { priority: 0, value: "ar-SA" },
          { priority: 1, value: "ca" },
        ],
      },
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Known list ref project",
      path: "/tmp/known-list-ref-project",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createProjectTask(
    new Request("http://localhost/api/tasks", {
      body: JSON.stringify({
        projectId: project.id,
        text: "Run for $list-country-codes",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(createResponse.status, 201);

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
  });
  assert.equal(tasks.length, 1);
});

test("POST /api/tasks rejects multiple list types in one task", async () => {
  await resetDatabase();

  await prisma.reusableList.create({
    data: {
      id: "country-codes",
      items: {
        create: [{ priority: 0, value: "ar-SA" }],
      },
    },
  });
  await prisma.reusableList.create({
    data: {
      id: "ios-langs",
      items: {
        create: [{ priority: 0, value: "en-US" }],
      },
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Multiple list types project",
      path: "/tmp/multiple-list-types-project",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createProjectTask(
    new Request("http://localhost/api/tasks", {
      body: JSON.stringify({
        projectId: project.id,
        text: "Run for $list-country-codes and $list-ios-langs",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(createResponse.status, 400);

  const payload = (await createResponse.json()) as {
    details?: string;
    error: { code: string };
  };
  assert.equal(payload.error.code, "TASK_CREATE_FAILED");
  assert.equal(
    payload.details,
    "Task can reference only one list type. Found: $list-country-codes, $list-ios-langs",
  );

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
  });
  assert.equal(tasks.length, 0);
});

test("POST /api/skills/:skillSetId/tasks rejects multiple list types in one task", async () => {
  await resetDatabase();

  await prisma.reusableList.create({
    data: {
      id: "country-codes",
      items: {
        create: [{ priority: 0, value: "ar-SA" }],
      },
    },
  });
  await prisma.reusableList.create({
    data: {
      id: "ios-langs",
      items: {
        create: [{ priority: 0, value: "en-US" }],
      },
    },
  });

  const skillSet = await prisma.skillSet.create({
    data: {
      name: "Multi-list skill set",
      priority: 0,
    },
    select: { id: true },
  });

  const createResponse = await createSkillTask(
    new Request(`http://localhost/api/skills/${skillSet.id}/tasks`, {
      body: JSON.stringify({
        text: "Run for $list-country-codes and $list-ios-langs",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ skillSetId: skillSet.id }) },
  );
  assert.equal(createResponse.status, 400);

  const payload = (await createResponse.json()) as {
    details?: string;
    error: { code: string };
  };
  assert.equal(payload.error.code, "SKILL_TASK_CREATE_FAILED");
  assert.equal(
    payload.details,
    "Task can reference only one list type. Found: $list-country-codes, $list-ios-langs",
  );

  const tasks = await prisma.skillTask.findMany({
    where: { instructionSetId: skillSet.id },
  });
  assert.equal(tasks.length, 0);
});
