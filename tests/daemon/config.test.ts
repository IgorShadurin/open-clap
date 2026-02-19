import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { loadDaemonConfig } from "../../scripts/daemon/config";

test("loadDaemonConfig applies DB > env > default precedence", () => {
  const config = loadDaemonConfig({
    env: {
      SETTINGS_daemon_max_parallel_tasks: "5",
      SETTINGS_codex_command_template: "env-template",
    },
    dbSettings: {
      daemon_max_parallel_tasks: "7",
    },
  });

  assert.equal(config.maxParallelTasks, 7);
  assert.equal(config.codexCommandTemplate, "env-template");
  assert.equal(config.pollIntervalMs, 1000);
});

test("loadDaemonConfig falls back when max parallel is invalid", () => {
  const config = loadDaemonConfig({
    dbSettings: {
      daemon_max_parallel_tasks: "0",
    },
  });

  assert.equal(config.maxParallelTasks, 2);
});
