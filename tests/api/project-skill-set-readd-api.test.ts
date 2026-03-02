import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import type { ApiErrorShape, SkillSetProjectReAddResult } from "../../shared/contracts";
import { POST as reAddSkillSetTasks } from "../../src/app/api/projects/[projectId]/skills/readd/route";
import { prisma } from "../../src/lib/prisma";
import {
  buildSkillTaskMetadata,
  parseSkillTaskMetadata,
} from "../../src/lib/skill-set-links";

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

test("POST /api/projects/:projectId/skills/readd removes old skill tasks and creates a fresh copy", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Re-add skill project",
      path: "/tmp/re-add-skill-project",
      priority: 0,
    },
    select: { id: true },
  });

  const oldScopeSubproject = await prisma.subproject.create({
    data: {
      name: "Old skill scope",
      path: "/tmp/re-add-skill-project/old",
      priority: 0,
      projectId: project.id,
    },
    select: { id: true },
  });

  const newScopeSubproject = await prisma.subproject.create({
    data: {
      name: "New skill scope",
      path: "/tmp/re-add-skill-project/new",
      priority: 1,
      projectId: project.id,
    },
    select: { id: true },
  });

  const skillSet = await prisma.skillSet.create({
    data: {
      name: "Localization",
      priority: 0,
    },
    select: { id: true, name: true },
  });

  const skillTaskOne = await prisma.skillTask.create({
    data: {
      instructionSetId: skillSet.id,
      priority: 0,
      text: "Translate feature text",
    },
    select: { id: true },
  });

  const skillTaskTwo = await prisma.skillTask.create({
    data: {
      instructionSetId: skillSet.id,
      priority: 1,
      text: "Update screenshot copy",
    },
    select: { id: true },
  });

  const metadataTaskOne = JSON.parse(
    buildSkillTaskMetadata({
      instructionSetId: skillSet.id,
      instructionSetName: skillSet.name,
      instructionTaskId: skillTaskOne.id,
      sourceInstructionSetId: skillSet.id,
      sourceInstructionSetName: skillSet.name,
    }),
  );

  const metadataTaskTwo = JSON.parse(
    buildSkillTaskMetadata({
      instructionSetId: skillSet.id,
      instructionSetName: skillSet.name,
      instructionTaskId: skillTaskTwo.id,
      sourceInstructionSetId: skillSet.id,
      sourceInstructionSetName: skillSet.name,
    }),
  );

  await prisma.task.createMany({
    data: [
      {
        metadata: metadataTaskOne,
        projectId: project.id,
        subprojectId: oldScopeSubproject.id,
        text: "Old copy 1",
      },
      {
        metadata: metadataTaskTwo,
        projectId: project.id,
        text: "Old copy 2",
      },
      {
        projectId: project.id,
        text: "Unrelated task",
      },
    ],
  });

  const response = await reAddSkillSetTasks(
    new Request(`http://localhost/api/projects/${project.id}/skills/readd`, {
      body: JSON.stringify({
        instructionSetId: skillSet.id,
        subprojectId: newScopeSubproject.id,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as SkillSetProjectReAddResult;
  assert.equal(payload.instructionSetId, skillSet.id);
  assert.equal(payload.removedTaskCount, 2);
  assert.equal(payload.createdTaskCount, 2);

  const tasks = await prisma.task.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    where: { projectId: project.id },
  });

  assert.equal(tasks.some((task) => task.text === "Old copy 1"), false);
  assert.equal(tasks.some((task) => task.text === "Old copy 2"), false);
  assert.equal(tasks.some((task) => task.text === "Unrelated task"), true);

  const linkedTasks = tasks.filter((task) => {
    const metadata = parseSkillTaskMetadata(task.metadata);
    return metadata?.instructionSetId === skillSet.id;
  });
  assert.equal(linkedTasks.length, 2);
  assert.deepEqual(
    linkedTasks.map((task) => task.text),
    ["Translate feature text", "Update screenshot copy"],
  );
  assert.equal(linkedTasks.every((task) => task.subprojectId === newScopeSubproject.id), true);
});

test("POST /api/projects/:projectId/skills/readd fails when a linked task is running", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Re-add blocked project",
      path: "/tmp/re-add-blocked-project",
      priority: 0,
    },
    select: { id: true },
  });

  const skillSet = await prisma.skillSet.create({
    data: {
      name: "Blocked skill set",
      priority: 0,
    },
    select: { id: true, name: true },
  });

  const skillTask = await prisma.skillTask.create({
    data: {
      instructionSetId: skillSet.id,
      priority: 0,
      text: "Blocked task",
    },
    select: { id: true },
  });

  const metadata = JSON.parse(
    buildSkillTaskMetadata({
      instructionSetId: skillSet.id,
      instructionSetName: skillSet.name,
      instructionTaskId: skillTask.id,
      sourceInstructionSetId: skillSet.id,
      sourceInstructionSetName: skillSet.name,
    }),
  );

  const existingLinkedTask = await prisma.task.create({
    data: {
      editLocked: true,
      metadata,
      projectId: project.id,
      status: "in_progress",
      text: "Existing running copy",
    },
    select: { id: true },
  });

  const response = await reAddSkillSetTasks(
    new Request(`http://localhost/api/projects/${project.id}/skills/readd`, {
      body: JSON.stringify({
        instructionSetId: skillSet.id,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(response.status, 400);
  const payload = (await response.json()) as ApiErrorShape;
  assert.equal(payload.error.code, "SKILL_SET_READD_FAILED");
  assert.equal(payload.details, "Running tasks cannot be edited");

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    select: { id: true, text: true },
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.id, existingLinkedTask.id);
  assert.equal(tasks[0]?.text, "Existing running copy");
});
