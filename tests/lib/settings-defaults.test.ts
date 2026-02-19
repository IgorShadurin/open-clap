import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS, getDefaultSettings } from "../../src/lib/settings-defaults";

test("DEFAULT_SETTINGS defines all required baseline keys", () => {
  assert.equal(
    DEFAULT_SETTINGS.codex_command_template.includes("{{message}}"),
    true,
  );
  assert.equal(DEFAULT_SETTINGS.task_message_template.length > 0, true);
  assert.equal(
    DEFAULT_SETTINGS.task_message_template_with_history.length > 0,
    true,
  );
  assert.equal(DEFAULT_SETTINGS.daemon_max_parallel_tasks, "2");
  assert.equal(DEFAULT_SETTINGS.default_project_base_path, ".");
  assert.equal(DEFAULT_SETTINGS.project_path_sort_mode, "modified");
});

test("getDefaultSettings returns a copy", () => {
  const first = getDefaultSettings();
  const second = getDefaultSettings();

  first.project_path_sort_mode = "name";

  assert.equal(second.project_path_sort_mode, "modified");
});
