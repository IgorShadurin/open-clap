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

test("TaskScheduler applies runtime max-parallel updates without interrupting active tasks", () => {
  const scheduler = new TaskScheduler(3);

  assert.equal(scheduler.startTask("a"), true);
  assert.equal(scheduler.startTask("b"), true);
  assert.equal(scheduler.activeCount(), 2);
  assert.equal(scheduler.availableSlots(), 1);

  scheduler.setMaxParallelTasks(1);

  assert.equal(scheduler.getMaxParallelTasks(), 1);
  assert.equal(scheduler.availableSlots(), 0);
  assert.equal(scheduler.startTask("c"), false);

  scheduler.finishTask("a");
  scheduler.finishTask("b");
  assert.equal(scheduler.activeCount(), 0);
  assert.equal(scheduler.availableSlots(), 1);
});
