import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { GET as listInstructionSets } from "../../src/app/api/instructions/route";
import { POST as createInstructionSet } from "../../src/app/api/instructions/route";
import { PATCH as updateInstructionSet } from "../../src/app/api/instructions/[instructionSetId]/route";
import { POST as createInstructionTask } from "../../src/app/api/instructions/[instructionSetId]/tasks/route";
import { POST as instructionTaskAction } from "../../src/app/api/instructions/tasks/[taskId]/action/route";
import { POST as reorderInstructionTasks } from "../../src/app/api/instructions/tasks/reorder/route";
import { POST as reorderInstructionSets } from "../../src/app/api/instructions/reorder/route";
import { prisma } from "../../src/lib/prisma";

async function resetDatabase(): Promise<void> {
  await prisma.instructionTask.deleteMany();
  await prisma.instructionSet.deleteMany();
}

test.after(async () => {
  await resetDatabase();
});

test("instruction sets support create/update/reorder and task actions", async () => {
  await resetDatabase();

  const firstCreateResponse = await createInstructionSet(
    new Request("http://localhost/api/instructions", {
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

  const secondCreateResponse = await createInstructionSet(
    new Request("http://localhost/api/instructions", {
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

  const updateResponse = await updateInstructionSet(
    new Request(`http://localhost/api/instructions/${firstSet.id}`, {
      body: JSON.stringify({
        description: "Updated description",
        mainPageTasksVisible: false,
        name: "Updated first set",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ instructionSetId: firstSet.id }) },
  );
  assert.equal(updateResponse.status, 200);

  const listResponse = await listInstructionSets();
  assert.equal(listResponse.status, 200);
  const rows = (await listResponse.json()) as Array<{
    id: string;
    mainPageTasksVisible: boolean;
  }>;
  const updatedRow = rows.find((item) => item.id === firstSet.id);
  assert.ok(updatedRow);
  assert.equal(updatedRow.mainPageTasksVisible, false);

  const createTaskResponse = await createInstructionTask(
    new Request(`http://localhost/api/instructions/${firstSet.id}/tasks`, {
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
    { params: Promise.resolve({ instructionSetId: firstSet.id }) },
  );
  assert.equal(createTaskResponse.status, 201);
  const firstTask = (await createTaskResponse.json()) as { id: string };

  const createSecondTaskResponse = await createInstructionTask(
    new Request(`http://localhost/api/instructions/${firstSet.id}/tasks`, {
      body: JSON.stringify({
        text: "Task two",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ instructionSetId: firstSet.id }) },
  );
  assert.equal(createSecondTaskResponse.status, 201);
  const secondTask = (await createSecondTaskResponse.json()) as { id: string };

  const pauseResponse = await instructionTaskAction(
    new Request(`http://localhost/api/instructions/tasks/${firstTask.id}/action`, {
      body: JSON.stringify({ action: "pause" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ taskId: firstTask.id }) },
  );
  assert.equal(pauseResponse.status, 204);

  const pausedTask = await prisma.instructionTask.findUnique({
    select: { paused: true },
    where: { id: firstTask.id },
  });
  assert.equal(pausedTask?.paused, true);

  const reorderTasksResponse = await reorderInstructionTasks(
    new Request("http://localhost/api/instructions/tasks/reorder", {
      body: JSON.stringify({
        instructionSetId: firstSet.id,
        orderedIds: [secondTask.id, firstTask.id],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(reorderTasksResponse.status, 204);

  const reorderedTasks = await prisma.instructionTask.findMany({
    orderBy: [{ priority: "asc" }],
    select: { id: true },
    where: { instructionSetId: firstSet.id },
  });
  assert.deepEqual(
    reorderedTasks.map((item) => item.id),
    [secondTask.id, firstTask.id],
  );

  const reorderSetsResponse = await reorderInstructionSets(
    new Request("http://localhost/api/instructions/reorder", {
      body: JSON.stringify({
        orderedIds: [secondSet.id, firstSet.id],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(reorderSetsResponse.status, 204);

  const reorderedSets = await prisma.instructionSet.findMany({
    orderBy: [{ priority: "asc" }],
    select: { id: true },
  });
  assert.deepEqual(
    reorderedSets.map((item) => item.id),
    [secondSet.id, firstSet.id],
  );
});
