import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskScopeHref,
  canEditTask,
  extractApiErrorMessage,
} from "../../src/components/app-dashboard/helpers";

test("canEditTask disables editing when task is locked or in progress", () => {
  assert.equal(canEditTask({ editLocked: false, status: "created" }), true);
  assert.equal(canEditTask({ editLocked: true, status: "created" }), false);
  assert.equal(canEditTask({ editLocked: false, status: "in_progress" }), false);
});

test("extractApiErrorMessage formats actionable API error payload", () => {
  assert.equal(
    extractApiErrorMessage(400, {
      details: "Path does not exist",
      error: {
        code: "PROJECT_CREATE_FAILED",
        message: "Failed to create project",
      },
    }),
    "[PROJECT_CREATE_FAILED] Failed to create project: Path does not exist",
  );
});

test("extractApiErrorMessage falls back to status when payload is missing", () => {
  assert.equal(extractApiErrorMessage(500), "Request failed with status 500");
});

test("buildTaskScopeHref always points to the project tasks page", () => {
  assert.equal(buildTaskScopeHref("project_1"), "/projects/project_1/tasks");
  assert.equal(
    buildTaskScopeHref("project_1", "subproject A"),
    "/projects/project_1/tasks",
  );
});
