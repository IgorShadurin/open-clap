import assert from "node:assert/strict";
import test from "node:test";

import type { InstructionSetTreeItem } from "../../src/shared/contracts";
import {
  buildInstructionTaskMetadata,
  parseInstructionTaskMetadata,
  resolveInstructionSetTasks,
} from "../../src/lib/skill-set-links";

test("build and parse instruction task metadata", () => {
  const encoded = buildInstructionTaskMetadata({
    instructionSetId: "set-a",
    instructionSetName: "Set A",
    sourceInstructionSetId: "set-a",
    sourceInstructionSetName: "Set A",
    instructionTaskId: "task-a",
  });

  assert.deepEqual(parseInstructionTaskMetadata(encoded), {
    kind: "instruction-task",
    instructionSetId: "set-a",
    instructionSetName: "Set A",
    instructionTaskId: "task-a",
    sourceInstructionSetId: "set-a",
    sourceInstructionSetName: "Set A",
    isManuallyEdited: false,
  });
});

test("parse legacy instruction task metadata without kind field", () => {
  const legacy = JSON.stringify({
    instructionSetId: "set-a",
    instructionSetName: "Set A",
    instructionTaskId: "task-a",
    sourceInstructionSetId: "set-b",
    sourceInstructionSetName: "Set B",
    isManuallyEdited: true,
  });

  assert.deepEqual(parseInstructionTaskMetadata(legacy), {
    kind: "instruction-task",
    instructionSetId: "set-a",
    instructionSetName: "Set A",
    instructionTaskId: "task-a",
    sourceInstructionSetId: "set-b",
    sourceInstructionSetName: "Set B",
    isManuallyEdited: true,
  });
});

test("resolveInstructionSetTasks includes linked instruction tasks in order", () => {
  const instructionSets = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      description: "Root set",
      id: "set-a",
      imagePath: null,
      linkedInstructionSetIds: ["set-b"],
      mainPageTasksVisible: true,
      name: "Set A",
      priority: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          id: "task-a1",
          instructionSetId: "set-a",
          includePreviousContext: true,
          model: "gpt-5.3-codex-spark",
          paused: false,
          previousContextMessages: 2,
          priority: 0,
          reasoning: "medium",
          text: "Task A1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      description: "Linked set",
      id: "set-b",
      imagePath: null,
      linkedInstructionSetIds: [],
      mainPageTasksVisible: true,
      name: "Set B",
      priority: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          id: "task-b1",
          instructionSetId: "set-b",
          includePreviousContext: false,
          model: "gpt-5.3-codex-spark",
          paused: false,
          previousContextMessages: 0,
          priority: 0,
          reasoning: "medium",
          text: "Task B1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  ] as const satisfies InstructionSetTreeItem[];

  const tasks = resolveInstructionSetTasks(instructionSets, "set-a");
  assert.deepEqual(
    tasks.map((task) => task.id),
    ["task-a1", "task-b1"],
  );
  assert.equal(tasks[0].sourceInstructionSetName, "Set A");
  assert.equal(tasks[1].sourceInstructionSetName, "Set B");
});

test("resolveInstructionSetTasks ignores linked-set cycles", () => {
  const instructionSets = [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      description: "A",
      id: "set-a",
      imagePath: null,
      linkedInstructionSetIds: ["set-b"],
      mainPageTasksVisible: true,
      name: "A",
      priority: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          id: "task-a",
          instructionSetId: "set-a",
          includePreviousContext: false,
          model: "gpt-5.3-codex-spark",
          paused: false,
          previousContextMessages: 0,
          priority: 0,
          reasoning: "medium",
          text: "A task",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      description: "B",
      id: "set-b",
      imagePath: null,
      linkedInstructionSetIds: ["set-a"],
      mainPageTasksVisible: true,
      name: "B",
      priority: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          id: "task-b",
          instructionSetId: "set-b",
          includePreviousContext: false,
          model: "gpt-5.3-codex-spark",
          paused: false,
          previousContextMessages: 0,
          priority: 0,
          reasoning: "medium",
          text: "B task",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  ] as const satisfies InstructionSetTreeItem[];

  const tasks = resolveInstructionSetTasks(instructionSets, "set-a");
  assert.deepEqual(tasks.map((task) => task.id), ["task-a", "task-b"]);
});
