import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { validateSettingValue } from "../../src/lib/settings-validation";

function okPathValidator(): Promise<{ exists: boolean; isDirectory: boolean }> {
  return Promise.resolve({ exists: true, isDirectory: true });
}

test("validateSettingValue enforces positive daemon_max_parallel_tasks", async () => {
  await assert.rejects(
    async () =>
      validateSettingValue("daemon_max_parallel_tasks", "0", {
        validatePath: okPathValidator,
      }),
    /positive integer/,
  );
});

test("validateSettingValue enforces project_path_sort_mode", async () => {
  await assert.rejects(
    async () =>
      validateSettingValue("project_path_sort_mode", "priority", {
        validatePath: okPathValidator,
      }),
    /must be either `modified` or `name`/,
  );
});

test("validateSettingValue validates default_project_base_path existence", async () => {
  await assert.rejects(
    async () =>
      validateSettingValue("default_project_base_path", "/missing", {
        validatePath: async () => ({ exists: false, isDirectory: false }),
      }),
    /must point to an existing directory/,
  );
});

test("validateSettingValue validates required template placeholders", async () => {
  await assert.rejects(
    async () =>
      validateSettingValue("task_message_template", "Task: {{task}}", {
        validatePath: okPathValidator,
      }),
    /must include template token \{\{context\}\}/,
  );
});

test("validateSettingValue accepts valid template settings", async () => {
  await validateSettingValue(
    "task_message_template_with_history",
    "History: {{history}} Context: {{context}} Task: {{task}}",
    {
      validatePath: okPathValidator,
    },
  );

  assert.ok(true);
});
