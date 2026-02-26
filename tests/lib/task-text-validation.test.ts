import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { createTask, updateTask } from "../../src/lib/entities-service";
import {
  createInstructionSet,
  createInstructionTask,
  updateInstructionTask,
} from "../../src/lib/skills-service";
import { prisma } from "../../src/lib/prisma";

async function resetDatabase(): Promise<void> {
  await prisma.task.deleteMany();
  await prisma.skillTask.deleteMany();
  await prisma.skillSet.deleteMany();
  await prisma.project.deleteMany();
}

test.after(async () => {
  await resetDatabase();
});

test("createTask rejects whitespace-only text", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Validation project",
      path: "/tmp/validation-project",
    },
  });

  await assert.rejects(
    createTask({
      projectId: project.id,
      text: "   \n\t ",
    }),
    (error) => {
      assert.equal(error instanceof Error ? error.message : "", "Task text is required");
      return true;
    },
  );
});

test("updateTask rejects whitespace-only text", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Validation project update",
      path: "/tmp/validation-project-update",
    },
  });

  const task = await createTask({
    projectId: project.id,
    text: "Initial task",
  });

  await assert.rejects(
    updateTask(task.id, {
      text: "   \n\t ",
    }),
    (error) => {
      assert.equal(error instanceof Error ? error.message : "", "Task text is required");
      return true;
    },
  );
});

test("createInstructionTask rejects whitespace-only text", async () => {
  await resetDatabase();

  const set = await createInstructionSet({
    name: "Validation set",
  });

  await assert.rejects(
    createInstructionTask({
      instructionSetId: set.id,
      text: "   \n\t ",
    }),
    (error) => {
      assert.equal(error instanceof Error ? error.message : "", "Task text is required");
      return true;
    },
  );
});

test("updateInstructionTask rejects whitespace-only text", async () => {
  await resetDatabase();

  const set = await createInstructionSet({
    name: "Validation set update",
  });
  const task = await createInstructionTask({
    instructionSetId: set.id,
    text: "Initial instruction task",
  });

  await assert.rejects(
    updateInstructionTask(task.id, {
      text: "   \n\t ",
    }),
    (error) => {
      assert.equal(error instanceof Error ? error.message : "", "Task text is required");
      return true;
    },
  );
});
