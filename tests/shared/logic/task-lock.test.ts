import assert from "node:assert/strict";
import test from "node:test";

import { canEditTaskEntity, isTaskExecutionLocked } from "../../../shared/logic/task-lock";

test("isTaskExecutionLocked blocks locked and running tasks", () => {
  assert.equal(isTaskExecutionLocked({ editLocked: true, status: "created" }), true);
  assert.equal(isTaskExecutionLocked({ editLocked: false, status: "in_progress" }), true);
  assert.equal(isTaskExecutionLocked({ editLocked: false, status: "done" }), false);
});

test("canEditTaskEntity mirrors the execution lock decision", () => {
  assert.equal(canEditTaskEntity({ editLocked: false, status: "created" }), true);
  assert.equal(canEditTaskEntity({ editLocked: true, status: "created" }), false);
});
