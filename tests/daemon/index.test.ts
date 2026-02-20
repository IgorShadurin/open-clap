import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { resolveDaemonApiBaseUrl, startDaemon } from "../../scripts/daemon/index";

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

test("resolveDaemonApiBaseUrl prefers explicit DAEMON_API_BASE_URL", () => {
  const resolved = resolveDaemonApiBaseUrl({
    DAEMON_API_BASE_URL: "  http://127.0.0.1:7777  ",
    NODE_ENV: "development",
    PORT: "3000",
  });

  assert.equal(resolved, "http://127.0.0.1:7777");
});

test("resolveDaemonApiBaseUrl falls back to localhost:PORT outside tests", () => {
  const resolved = resolveDaemonApiBaseUrl({
    NODE_ENV: "development",
    PORT: "4567",
  });

  assert.equal(resolved, "http://localhost:4567");
});

test("resolveDaemonApiBaseUrl returns null in test mode when no explicit URL", () => {
  const resolved = resolveDaemonApiBaseUrl({
    NODE_ENV: "test",
    PORT: "3000",
  });

  assert.equal(resolved, null);
});
