import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { GET as listSkillSets } from "../../src/app/api/skills/route";
import { POST as createSkillSet } from "../../src/app/api/skills/route";
import { PATCH as updateSkillSet } from "../../src/app/api/skills/[skillSetId]/route";
import { POST as createSkillSetTask } from "../../src/app/api/skills/[skillSetId]/tasks/route";
import { POST as skillSetTaskAction } from "../../src/app/api/skills/tasks/[taskId]/action/route";
import { POST as reorderSkillSetTasks } from "../../src/app/api/skills/tasks/reorder/route";
import { POST as reorderSkillSets } from "../../src/app/api/skills/reorder/route";
import { prisma } from "../../src/lib/prisma";

async function resetDatabase(): Promise<void> {
  await prisma.skillTask.deleteMany();
  await prisma.skillSet.deleteMany();
}

test.after(async () => {
  await resetDatabase();
});

test("skill sets support create/update/reorder and task actions", async () => {
  await resetDatabase();

  const firstCreateResponse = await createSkillSet(
    new Request("http://localhost/api/skills", {
      body: JSON.stringify({
        description: "First set description",
        name: "First set",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(firstCreateResponse.status, 201);
  const firstSet = (await firstCreateResponse.json()) as { id: string };

  const secondCreateResponse = await createSkillSet(
    new Request("http://localhost/api/skills", {
      body: JSON.stringify({
        description: "Second set description",
        name: "Second set",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(secondCreateResponse.status, 201);
  const secondSet = (await secondCreateResponse.json()) as { id: string };

  const updateResponse = await updateSkillSet(
    new Request(`http://localhost/api/skills/${firstSet.id}`, {
      body: JSON.stringify({
        description: "Updated description",
        mainPageTasksVisible: false,
        name: "Updated first set",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ skillSetId: firstSet.id }) },
  );
  assert.equal(updateResponse.status, 200);

  const listResponse = await listSkillSets();
  assert.equal(listResponse.status, 200);
  const rows = (await listResponse.json()) as Array<{
    id: string;
    mainPageTasksVisible: boolean;
  }>;
  const updatedRow = rows.find((item) => item.id === firstSet.id);
  assert.ok(updatedRow);
  assert.equal(updatedRow.mainPageTasksVisible, false);

  const createTaskResponse = await createSkillSetTask(
    new Request(`http://localhost/api/skills/${firstSet.id}/tasks`, {
      body: JSON.stringify({
        includePreviousContext: true,
        model: "gpt-5.3-codex",
        previousContextMessages: 3,
        reasoning: "medium",
        text: "Task one",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ skillSetId: firstSet.id }) },
  );
  assert.equal(createTaskResponse.status, 201);
  const firstTask = (await createTaskResponse.json()) as { id: string };

  const createSecondTaskResponse = await createSkillSetTask(
    new Request(`http://localhost/api/skills/${firstSet.id}/tasks`, {
      body: JSON.stringify({
        text: "Task two",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ skillSetId: firstSet.id }) },
  );
  assert.equal(createSecondTaskResponse.status, 201);
  const secondTask = (await createSecondTaskResponse.json()) as { id: string };

  const pauseResponse = await skillSetTaskAction(
    new Request(`http://localhost/api/skills/tasks/${firstTask.id}/action`, {
      body: JSON.stringify({ action: "pause" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ taskId: firstTask.id }) },
  );
  assert.equal(pauseResponse.status, 204);

  const pausedTask = await prisma.skillTask.findUnique({
    select: { paused: true },
    where: { id: firstTask.id },
  });
  assert.equal(pausedTask?.paused, true);

  const reorderTasksResponse = await reorderSkillSetTasks(
    new Request("http://localhost/api/skills/tasks/reorder", {
      body: JSON.stringify({
        skillSetId: firstSet.id,
        orderedIds: [secondTask.id, firstTask.id],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(reorderTasksResponse.status, 204);

  const reorderedTasks = await prisma.skillTask.findMany({
    orderBy: [{ priority: "asc" }],
    select: { id: true },
    where: { instructionSetId: firstSet.id },
  });
  assert.deepEqual(
    reorderedTasks.map((item) => item.id),
    [secondTask.id, firstTask.id],
  );

  const reorderSetsResponse = await reorderSkillSets(
    new Request("http://localhost/api/skills/reorder", {
      body: JSON.stringify({
        orderedIds: [secondSet.id, firstSet.id],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(reorderSetsResponse.status, 204);

  const reorderedSets = await prisma.skillSet.findMany({
    orderBy: [{ priority: "asc" }],
    select: { id: true },
  });
  assert.deepEqual(
    reorderedSets.map((item) => item.id),
    [secondSet.id, firstSet.id],
  );
});
