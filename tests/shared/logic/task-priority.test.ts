import { assertTestDatabaseGuard } from "../../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import type { DaemonTask } from "../../../shared/contracts/task";
import {
  getExecutionScopeKey,
  selectParallelTasks,
  sortTasksByPriority,
} from "../../../shared/logic/task-priority";

function makeTask(
  id: string,
  options: Partial<DaemonTask> = {},
): DaemonTask {
  return {
    id,
    text: `Task ${id}`,
    contextPath: `/tmp/${id}`,
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
    priority: 100,
    projectId: "project-a",
    subprojectId: null,
    ...options,
  };
}

test("getExecutionScopeKey separates project and subproject scopes", () => {
  assert.equal(
    getExecutionScopeKey(makeTask("p-main", { projectId: "p1", subprojectId: null })),
    "project:p1",
  );
  assert.equal(
    getExecutionScopeKey(makeTask("p-sub", { projectId: "p1", subprojectId: "s1" })),
    "subproject:p1:s1",
  );
});

test("sortTasksByPriority keeps lower priority value first and is stable for ties", () => {
  const ordered = sortTasksByPriority([
    makeTask("a", { priority: 10 }),
    makeTask("b", { priority: 1 }),
    makeTask("c", { priority: 1 }),
  ]);

  assert.deepEqual(
    ordered.map((task) => task.id),
    ["b", "c", "a"],
  );
});

test("selectParallelTasks allows one task per scope and fills with other scopes", () => {
  const selected = selectParallelTasks(
    [
      makeTask("main-1", { priority: 1, projectId: "p1", subprojectId: null }),
      makeTask("main-2", { priority: 2, projectId: "p1", subprojectId: null }),
      makeTask("sub-1-a", { priority: 3, projectId: "p1", subprojectId: "s1" }),
      makeTask("sub-1-b", { priority: 4, projectId: "p1", subprojectId: "s1" }),
      makeTask("sub-2", { priority: 5, projectId: "p1", subprojectId: "s2" }),
      makeTask("proj-2-main", { priority: 6, projectId: "p2", subprojectId: null }),
    ],
    4,
  );

  assert.deepEqual(
    selected.map((task) => task.id),
    ["main-1", "sub-1-a", "sub-2", "proj-2-main"],
  );
});

test("selectParallelTasks excludes scopes that are already running", () => {
  const selected = selectParallelTasks(
    [
      makeTask("p1-main", { priority: 1, projectId: "p1", subprojectId: null }),
      makeTask("p1-sub1", { priority: 2, projectId: "p1", subprojectId: "s1" }),
      makeTask("p1-sub2", { priority: 3, projectId: "p1", subprojectId: "s2" }),
      makeTask("p2-main", { priority: 4, projectId: "p2", subprojectId: null }),
    ],
    4,
    new Set(["project:p1", "subproject:p1:s2"]),
  );

  assert.deepEqual(
    selected.map((task) => task.id),
    ["p1-sub1", "p2-main"],
  );
});

test("selectParallelTasks handles malformed tasks via unknown scope fallback", () => {
  const selected = selectParallelTasks(
    [
      makeTask("x1", { projectId: undefined, subprojectId: undefined, priority: 1 }),
      makeTask("x2", { projectId: undefined, subprojectId: undefined, priority: 2 }),
    ],
    10,
  );

  assert.deepEqual(
    selected.map((task) => task.id),
    ["x1", "x2"],
  );
});
