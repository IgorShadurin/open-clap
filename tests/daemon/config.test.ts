import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { loadDaemonConfig } from "../../scripts/daemon/config";

test("loadDaemonConfig applies runtime settings > env > default precedence", () => {
  const config = loadDaemonConfig({
    env: {
      SETTINGS_daemon_max_parallel_tasks: "5",
      SETTINGS_codex_command_template: "env-template",
    },
    settings: {
      daemon_max_parallel_tasks: "7",
    },
  });

  assert.equal(config.maxParallelTasks, 7);
  assert.equal(config.codexCommandTemplate, "env-template");
  assert.equal(config.pollIntervalMs, 1000);
});

test("loadDaemonConfig falls back when max parallel is invalid", () => {
  const config = loadDaemonConfig({
    settings: {
      daemon_max_parallel_tasks: "0",
    },
  });

  assert.equal(config.maxParallelTasks, 2);
});

test("loadDaemonConfig normalizes legacy codex template flags", () => {
  const config = loadDaemonConfig({
    settings: {
      codex_command_template:
        'codex run --cwd "{{contextPath}}" --model "{{model}}" --reasoning "{{reasoning}}" "{{message}}"',
    },
  });

  assert.equal(config.codexCommandTemplate.includes("codex exec"), true);
  assert.equal(config.codexCommandTemplate.includes("--cd"), true);
  assert.equal(config.codexCommandTemplate.includes("--reasoning"), false);
  assert.equal(
    config.codexCommandTemplate.includes('-c model_reasoning_effort="{{reasoning}}"'),
    true,
  );
  assert.equal(config.codexCommandTemplate.includes("Reasoning: {{reasoning}}"), false);
  assert.equal(config.codexCommandTemplateWarnings.length >= 1, true);
});
