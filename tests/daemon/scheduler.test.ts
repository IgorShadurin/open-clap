import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { TaskScheduler } from "../../scripts/daemon/scheduler";

test("TaskScheduler enforces max parallel capacity", () => {
  const scheduler = new TaskScheduler(2);

  assert.equal(scheduler.startTask("a"), true);
  assert.equal(scheduler.startTask("b"), true);
  assert.equal(scheduler.startTask("c"), false);
  assert.equal(scheduler.availableSlots(), 0);

  scheduler.finishTask("a");

  assert.equal(scheduler.availableSlots(), 1);
  assert.equal(scheduler.startTask("c"), true);
});
