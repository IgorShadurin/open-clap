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
  await prisma.reusableListItem.deleteMany();
  await prisma.reusableList.deleteMany();
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

test("createTask rejects unknown list references", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Unknown list project",
      path: "/tmp/unknown-list-project",
    },
  });

  await assert.rejects(
    createTask({
      projectId: project.id,
      text: "Run for $list-country-codes",
    }),
    (error) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "Unknown list reference(s): $list-country-codes",
      );
      return true;
    },
  );
});

test("createTask accepts known list references", async () => {
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
      name: "Known list project",
      path: "/tmp/known-list-project",
    },
  });

  const task = await createTask({
    projectId: project.id,
    text: "Run for $list-country-codes",
  });
  assert.equal(task.text, "Run for $list-country-codes");
});

test("createTask rejects multiple list types in one task", async () => {
  await resetDatabase();

  await prisma.reusableList.createMany({
    data: [
      { id: "country-codes" },
      { id: "ios-langs" },
    ],
  });

  const project = await prisma.project.create({
    data: {
      name: "Multi list type project",
      path: "/tmp/multi-list-type-project",
    },
  });

  await assert.rejects(
    createTask({
      projectId: project.id,
      text: "Run for $list-country-codes and $list-ios-langs",
    }),
    (error) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "Task can reference only one list type. Found: $list-country-codes, $list-ios-langs",
      );
      return true;
    },
  );
});

test("createInstructionTask rejects unknown list references", async () => {
  await resetDatabase();

  const set = await createInstructionSet({
    name: "Unknown list skill set",
  });

  await assert.rejects(
    createInstructionTask({
      instructionSetId: set.id,
      text: "Run for $list-alphabet",
    }),
    (error) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "Unknown list reference(s): $list-alphabet",
      );
      return true;
    },
  );
});

test("updateTask rejects unknown list references", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      name: "Update unknown list project",
      path: "/tmp/update-unknown-list-project",
    },
  });

  const task = await createTask({
    projectId: project.id,
    text: "Initial task",
  });

  await assert.rejects(
    updateTask(task.id, {
      text: "Run for $list-country-codes",
    }),
    (error) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "Unknown list reference(s): $list-country-codes",
      );
      return true;
    },
  );
});
