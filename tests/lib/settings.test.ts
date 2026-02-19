import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSettingsFromEnv,
  resolveSetting,
  resolveSettings,
} from "../../src/lib/settings";

test("parseSettingsFromEnv parses SETTINGS_ keys and ignores empty values", () => {
  const env = {
    SETTINGS_MAX_PARALLEL_TASKS: "4",
    SETTINGS_template: "run {{task}}",
    SETTINGS_EMPTY: "   ",
    SETTINGS_: "invalid",
    UNRELATED_KEY: "skip",
  };

  const parsed = parseSettingsFromEnv(env);

  assert.deepEqual(parsed, {
    max_parallel_tasks: "4",
    template: "run {{task}}",
  });
});

test("resolveSetting follows db > env > default precedence", () => {
  const defaults = { mode: "default-mode" };
  const envSettings = { mode: "env-mode" };
  const dbSettings = { mode: "db-mode" };

  const resolved = resolveSetting("mode", defaults, envSettings, dbSettings);

  assert.deepEqual(resolved, {
    key: "mode",
    source: "db",
    value: "db-mode",
  });
});

test("resolveSettings builds effective map with per-key source", () => {
  const defaults = {
    codex_command_template: "codex run --task {{task}}",
    daemon_parallel_limit: "2",
  };
  const dbSettings = {
    daemon_parallel_limit: "8",
  };
  const env = {
    SETTINGS_CODEX_COMMAND_TEMPLATE: "codex exec {{task}}",
    SETTINGS_EXTRA: "enabled",
  };

  const effective = resolveSettings({ dbSettings, defaults, env });

  assert.deepEqual(effective.codex_command_template, {
    key: "codex_command_template",
    source: "env",
    value: "codex exec {{task}}",
  });

  assert.deepEqual(effective.daemon_parallel_limit, {
    key: "daemon_parallel_limit",
    source: "db",
    value: "8",
  });

  assert.deepEqual(effective.extra, {
    key: "extra",
    source: "env",
    value: "enabled",
  });
});
