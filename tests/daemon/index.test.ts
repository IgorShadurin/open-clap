import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { startDaemon } from "../../scripts/daemon/index";

test("startDaemon respects max parallel setting from env", () => {
  const previous = process.env.SETTINGS_daemon_max_parallel_tasks;
  process.env.SETTINGS_daemon_max_parallel_tasks = "4";

  const runtime = startDaemon();

  try {
    assert.equal(runtime.scheduler.availableSlots(), 4);
  } finally {
    runtime.stop();
    if (previous === undefined) {
      delete process.env.SETTINGS_daemon_max_parallel_tasks;
    } else {
      process.env.SETTINGS_daemon_max_parallel_tasks = previous;
    }
  }
});
