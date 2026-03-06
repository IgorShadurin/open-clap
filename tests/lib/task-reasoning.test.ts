import test from "node:test";
import assert from "node:assert/strict";

import { TASK_MODEL_OPTIONS, getTaskModelDisplayLabel } from "../../src/lib/task-reasoning";

test("task model options include gpt-5.4", () => {
  const models = TASK_MODEL_OPTIONS.map((option) => option.value);

  assert.equal(models.includes("gpt-5.4"), true);
});

test("getTaskModelDisplayLabel formats gpt-5.4 from the shared option list", () => {
  assert.equal(getTaskModelDisplayLabel("gpt-5.4"), "🆕 gpt-5.4");
});
