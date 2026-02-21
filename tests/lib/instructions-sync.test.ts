import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstructionTaskMetadata,
  parseInstructionTaskMetadata,
} from "../../src/lib/instruction-set-links";
import { createTask, deleteTask, updateTask } from "../../src/lib/entities-service";
import {
  createInstructionTask,
  createInstructionSet,
  deleteInstructionTask,
  updateInstructionSet,
  reorderInstructionTasks,
  updateInstructionTask,
} from "../../src/lib/instructions-service";
import { prisma } from "../../src/lib/prisma";

async function resetDatabase(): Promise<void> {
  await prisma.task.deleteMany();
  await prisma.instructionTask.deleteMany();
  await prisma.instructionSet.deleteMany();
  await prisma.project.deleteMany();
}

function instructionMetadataPayload(input: {
  composerInstructionSetId: string;
  composerInstructionSetName: string;
  sourceInstructionSetId: string;
  sourceInstructionSetName: string;
  sourceInstructionTaskId: string;
  isManuallyEdited?: boolean;
}): string {
  return buildInstructionTaskMetadata({
    instructionSetId: input.composerInstructionSetId,
    instructionSetName: input.composerInstructionSetName,
    instructionTaskId: input.sourceInstructionTaskId,
    sourceInstructionSetId: input.sourceInstructionSetId,
    sourceInstructionSetName: input.sourceInstructionSetName,
    isManuallyEdited: input.isManuallyEdited,
  });
}

test.after(async () => {
  await resetDatabase();
});

test("instruction task updates propagate to linked project tasks until manually edited", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      metadata: { createdFrom: "instruction-sync-test" },
      name: "Project A",
      path: "/tmp/project-a",
    },
  });
  const set = await createInstructionSet({
    name: "Set A",
  });

  const instructionTask = await createInstructionTask({
    instructionSetId: set.id,
    text: "Initial task",
  });

  const projectTask = await createTask({
    includePreviousContext: instructionTask.includePreviousContext,
    model: instructionTask.model,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: instructionTask.id,
    }),
    previousContextMessages: instructionTask.previousContextMessages,
    projectId: project.id,
    reasoning: instructionTask.reasoning,
    text: instructionTask.text,
  });

  await updateInstructionTask(instructionTask.id, {
    text: "Updated from instructions",
    reasoning: "high",
    model: instructionTask.model,
  });

  const syncedTask = await prisma.task.findUnique({
    select: {
      id: true,
      metadata: true,
      text: true,
      reasoning: true,
    },
    where: { id: projectTask.id },
  });
  assert.equal(syncedTask?.text, "Updated from instructions");
  assert.equal(syncedTask?.reasoning, "high");

  const parsed = parseInstructionTaskMetadata(syncedTask?.metadata);
  assert.equal(parsed?.isManuallyEdited, false);

  await updateTask(projectTask.id, {
    text: "User edited task",
  });

  await updateInstructionTask(instructionTask.id, {
    text: "Second instruction edit",
    reasoning: "low",
  });

  const protectedTask = await prisma.task.findUnique({
    select: {
      id: true,
      metadata: true,
      text: true,
      reasoning: true,
    },
    where: { id: projectTask.id },
  });
  assert.equal(protectedTask?.text, "User edited task");
  assert.equal(protectedTask?.reasoning, "high");
  assert.equal(parseInstructionTaskMetadata(protectedTask?.metadata)?.isManuallyEdited, true);
});

test("new instruction tasks sync only to projects using the source set, and deletes skip manual edits", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      metadata: { createdFrom: "instruction-sync-test" },
      name: "Project B",
      path: "/tmp/project-b",
    },
  });
  const set = await createInstructionSet({
    name: "Set B",
  });

  const sourceTask = await createInstructionTask({
    instructionSetId: set.id,
    text: "Base task",
  });
  await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: sourceTask.id,
    }),
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: sourceTask.reasoning,
    text: sourceTask.text,
  });
  const manuallyEditedTask = await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: sourceTask.id,
    }),
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: sourceTask.reasoning,
    text: "duplicate sync target",
    skipInstructionSetDuplicateCheck: true,
  });
  await updateTask(manuallyEditedTask.id, {
    text: "manually edited copy",
  });

  const addedTask = await createInstructionTask({
    instructionSetId: set.id,
    text: "Added later",
  });
  const projectTasksAfterCreate = await prisma.task.findMany({
    select: { metadata: true, text: true },
    where: {
      projectId: project.id,
      metadata: { not: null },
    },
  });
  const createdFromAddedTask = projectTasksAfterCreate.filter(
    (task) => parseInstructionTaskMetadata(task.metadata)?.instructionTaskId === addedTask.id,
  );
  assert.equal(createdFromAddedTask.length, 1);
  assert.equal(createdFromAddedTask[0]?.text, "Added later");

  await deleteInstructionTask(sourceTask.id);

  const remainingTasks = await prisma.task.findMany({
    select: { metadata: true, text: true },
    where: {
      projectId: project.id,
      metadata: { not: null },
    },
  });
  const remainingSourceLinkedTasks = remainingTasks.filter(
    (task) => parseInstructionTaskMetadata(task.metadata)?.sourceInstructionSetId === set.id,
  );
  const remainingLinkedTaskIds = remainingSourceLinkedTasks.map(
    (task) => parseInstructionTaskMetadata(task.metadata)?.instructionTaskId,
  );
  const sourceTaskAutoRemaining = remainingSourceLinkedTasks.filter((task) => {
    const parsedMetadata = parseInstructionTaskMetadata(task.metadata);
    return (
      parsedMetadata?.instructionTaskId === sourceTask.id &&
      parsedMetadata.isManuallyEdited !== true
    );
  });
  assert.equal(sourceTaskAutoRemaining.length, 0);
  assert.ok(remainingSourceLinkedTasks.some((task) => {
    const parsedMetadata = parseInstructionTaskMetadata(task.metadata);
    return (
      parsedMetadata?.instructionTaskId === sourceTask.id &&
      parsedMetadata.isManuallyEdited === true
    );
  }));
  assert.ok(remainingLinkedTaskIds.includes(addedTask.id));
  const manualTaskAfterDelete = await prisma.task.findUnique({
    where: { id: manuallyEditedTask.id },
  });
  assert.ok(manualTaskAfterDelete);
});

test("instruction updates affect only non-manually edited linked project tasks from the same source task", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      metadata: { createdFrom: "instruction-sync-test" },
      name: "Project C",
      path: "/tmp/project-c",
    },
  });

  const set = await createInstructionSet({
    name: "Set C",
  });
  const instructionTask = await createInstructionTask({
    instructionSetId: set.id,
    text: "Seed task",
  });

  const firstCopy = await createTask({
    includePreviousContext: instructionTask.includePreviousContext,
    model: instructionTask.model,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: instructionTask.id,
    }),
    previousContextMessages: instructionTask.previousContextMessages,
    projectId: project.id,
    reasoning: instructionTask.reasoning,
    text: instructionTask.text,
  });
  const secondCopy = await createTask({
    includePreviousContext: instructionTask.includePreviousContext,
    model: instructionTask.model,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: instructionTask.id,
    }),
    previousContextMessages: instructionTask.previousContextMessages,
    projectId: project.id,
    reasoning: instructionTask.reasoning,
    text: instructionTask.text,
    skipInstructionSetDuplicateCheck: true,
  });

  await updateTask(firstCopy.id, {
    reasoning: "xhigh",
  });

  await updateInstructionTask(instructionTask.id, {
    text: "Upgraded text",
    reasoning: "low",
  });

  const refreshedCopies = await prisma.task.findMany({
    where: {
      projectId: project.id,
      metadata: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      metadata: true,
      reasoning: true,
      text: true,
    },
  });

  const firstCopyRow = refreshedCopies.find((item) => item.id === firstCopy.id);
  const secondCopyRow = refreshedCopies.find((item) => item.id === secondCopy.id);

  assert.equal(firstCopyRow?.text, instructionTask.text);
  assert.equal(firstCopyRow?.reasoning, "xhigh");
  assert.equal(parseInstructionTaskMetadata(firstCopyRow?.metadata)?.isManuallyEdited, true);

  assert.equal(secondCopyRow?.text, "Upgraded text");
  assert.equal(secondCopyRow?.reasoning, "low");
  assert.equal(parseInstructionTaskMetadata(secondCopyRow?.metadata)?.isManuallyEdited, false);
});

test("editing instruction task params updates synced project tasks", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      metadata: { createdFrom: "instruction-sync-test" },
      name: "Project Params",
      path: "/tmp/project-params",
    },
  });

  const set = await createInstructionSet({
    name: "Set Params",
  });
  const instructionTask = await createInstructionTask({
    instructionSetId: set.id,
    includePreviousContext: false,
    model: "gpt-5.3-codex",
    previousContextMessages: 0,
    reasoning: "low",
    text: "Param task",
  });

  const syncedTask = await createTask({
    includePreviousContext: instructionTask.includePreviousContext,
    model: "gpt-5.3-codex",
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: instructionTask.id,
    }),
    previousContextMessages: instructionTask.previousContextMessages,
    projectId: project.id,
    reasoning: instructionTask.reasoning,
    text: instructionTask.text,
  });

  const manuallyEditedTask = await createTask({
    includePreviousContext: instructionTask.includePreviousContext,
    model: "gpt-5.3-codex",
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: instructionTask.id,
    }),
    previousContextMessages: instructionTask.previousContextMessages,
    projectId: project.id,
    reasoning: instructionTask.reasoning,
    text: instructionTask.text,
    skipInstructionSetDuplicateCheck: true,
  });
  await updateTask(manuallyEditedTask.id, {
    model: "custom",
    reasoning: "high",
  });

  await updateInstructionTask(instructionTask.id, {
    model: "gpt-5.3-codex-spark",
    previousContextMessages: 4,
    reasoning: "high",
    text: "Updated param task",
    includePreviousContext: true,
  });

  const refreshedSyncedTask = await prisma.task.findUnique({
    where: { id: syncedTask.id },
    select: {
      model: true,
      includePreviousContext: true,
      previousContextMessages: true,
      reasoning: true,
      text: true,
    },
  });
  assert.equal(refreshedSyncedTask?.model, "gpt-5.3-codex-spark");
  assert.equal(refreshedSyncedTask?.reasoning, "high");
  assert.equal(refreshedSyncedTask?.includePreviousContext, true);
  assert.equal(refreshedSyncedTask?.previousContextMessages, 4);
  assert.equal(refreshedSyncedTask?.text, "Updated param task");

  const refreshedManualTask = await prisma.task.findUnique({
    where: { id: manuallyEditedTask.id },
    select: {
      model: true,
      reasoning: true,
      includePreviousContext: true,
      previousContextMessages: true,
      text: true,
    },
  });
  assert.equal(refreshedManualTask?.model, "custom");
  assert.equal(refreshedManualTask?.reasoning, "high");
  assert.equal(refreshedManualTask?.text, instructionTask.text);
});

test("reordering instruction tasks updates order of synced project tasks in composer sets", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      metadata: { createdFrom: "instruction-sync-test" },
      name: "Project Reorder",
      path: "/tmp/project-reorder",
    },
  });

  const setA = await createInstructionSet({ name: "Set A" });
  const setB = await createInstructionSet({ name: "Set B" });

  const taskA1 = await createInstructionTask({
    instructionSetId: setA.id,
    text: "A1",
  });
  const taskA2 = await createInstructionTask({
    instructionSetId: setA.id,
    text: "A2",
  });
  const taskB1 = await createInstructionTask({
    instructionSetId: setB.id,
    text: "B1",
  });
  const taskB2 = await createInstructionTask({
    instructionSetId: setB.id,
    text: "B2",
  });

  await updateInstructionSet(setB.id, {
    linkedInstructionSetIds: [setA.id],
  });

  await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: setB.id,
      composerInstructionSetName: setB.name,
      sourceInstructionSetId: setB.id,
      sourceInstructionSetName: setB.name,
      sourceInstructionTaskId: taskB1.id,
    }),
    model: "gpt-5.3-codex-spark",
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskB1.text,
  });
  await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: setB.id,
      composerInstructionSetName: setB.name,
      sourceInstructionSetId: setB.id,
      sourceInstructionSetName: setB.name,
      sourceInstructionTaskId: taskB2.id,
    }),
    model: "gpt-5.3-codex-spark",
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskB2.text,
    skipInstructionSetDuplicateCheck: true,
  });
  await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: setB.id,
      composerInstructionSetName: setB.name,
      sourceInstructionSetId: setA.id,
      sourceInstructionSetName: setA.name,
      sourceInstructionTaskId: taskA1.id,
    }),
    model: "gpt-5.3-codex-spark",
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskA1.text,
    skipInstructionSetDuplicateCheck: true,
  });
  await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: setB.id,
      composerInstructionSetName: setB.name,
      sourceInstructionSetId: setA.id,
      sourceInstructionSetName: setA.name,
      sourceInstructionTaskId: taskA2.id,
    }),
    model: "gpt-5.3-codex-spark",
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskA2.text,
    skipInstructionSetDuplicateCheck: true,
  });

  await reorderInstructionTasks(setB.id, [taskB2.id, taskB1.id]);

  const projectTasks = await prisma.task.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      metadata: true,
    },
    where: {
      projectId: project.id,
      metadata: { not: null },
    },
  });

  const projectOrder = projectTasks
    .filter((row) => {
      const parsed = parseInstructionTaskMetadata(row.metadata);
      return parsed?.instructionSetId === setB.id;
    })
    .map((row) => parseInstructionTaskMetadata(row.metadata)?.instructionTaskId);

  assert.deepEqual(projectOrder, [taskB2.id, taskB1.id, taskA1.id, taskA2.id]);
});

test("reordering instruction tasks skips deleted linked project tasks and reorders remaining ones", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      metadata: { createdFrom: "instruction-sync-test" },
      name: "Project Reorder With Missing Task",
      path: "/tmp/project-missing",
    },
  });

  const set = await createInstructionSet({
    name: "Set Missing",
  });

  const taskOne = await createInstructionTask({
    instructionSetId: set.id,
    text: "Task one",
  });
  const taskTwo = await createInstructionTask({
    instructionSetId: set.id,
    text: "Task two",
  });
  const taskThree = await createInstructionTask({
    instructionSetId: set.id,
    text: "Task three",
  });
  const taskFour = await createInstructionTask({
    instructionSetId: set.id,
    text: "Task four",
  });

  const projectTaskOne = await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: taskOne.id,
    }),
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskOne.text,
  });

  const projectTaskTwo = await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: taskTwo.id,
    }),
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskTwo.text,
    skipInstructionSetDuplicateCheck: true,
  });

  const projectTaskThree = await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: taskThree.id,
    }),
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskThree.text,
    skipInstructionSetDuplicateCheck: true,
  });

  const projectTaskFour = await createTask({
    includePreviousContext: false,
    metadata: instructionMetadataPayload({
      composerInstructionSetId: set.id,
      composerInstructionSetName: set.name,
      sourceInstructionSetId: set.id,
      sourceInstructionSetName: set.name,
      sourceInstructionTaskId: taskFour.id,
    }),
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "medium",
    text: taskFour.text,
    skipInstructionSetDuplicateCheck: true,
  });

  await deleteTask(projectTaskThree.id);

  await reorderInstructionTasks(set.id, [taskThree.id, taskOne.id, taskFour.id, taskTwo.id]);

  const projectTasks = await prisma.task.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    where: {
      projectId: project.id,
      metadata: { not: null },
    },
    select: {
      id: true,
      metadata: true,
    },
  });

  const orderedIds = projectTasks
    .filter((item) => {
      const metadata = parseInstructionTaskMetadata(item.metadata);
      return metadata?.instructionSetId === set.id;
    })
    .map((item) => parseInstructionTaskMetadata(item.metadata)?.instructionTaskId);

  assert.deepEqual(orderedIds, [taskOne.id, taskFour.id, taskTwo.id]);

  const remainingTaskIds = new Set(
    [projectTaskOne.id, projectTaskTwo.id, projectTaskFour.id],
  );
  assert.equal(
    projectTasks.filter((item) => remainingTaskIds.has(item.id)).length,
    3,
  );
});

test("adding the same instruction set twice to a project is blocked", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      metadata: { createdFrom: "instruction-sync-test" },
      name: "Project Duplicate",
      path: "/tmp/project-duplicate",
    },
  });

  const set = await createInstructionSet({
    name: "Set Duplicate",
  });
  const instructionTask = await createInstructionTask({
    instructionSetId: set.id,
    text: "Duplicate task",
  });
  const metadata = instructionMetadataPayload({
    composerInstructionSetId: set.id,
    composerInstructionSetName: set.name,
    sourceInstructionSetId: set.id,
    sourceInstructionSetName: set.name,
    sourceInstructionTaskId: instructionTask.id,
  });

  await createTask({
    includePreviousContext: false,
    metadata,
    model: "gpt-5.3-codex",
    previousContextMessages: 0,
    projectId: project.id,
    reasoning: "low",
    text: instructionTask.text,
  });

  await assert.rejects(
    createTask({
      includePreviousContext: false,
      metadata,
      model: "gpt-5.3-codex",
      previousContextMessages: 0,
      projectId: project.id,
      reasoning: "low",
      text: instructionTask.text,
    }),
    (error) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "Instruction set already added to this project scope",
      );
      return true;
    },
  );
});
