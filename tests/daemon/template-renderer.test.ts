import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { renderTaskPrompt } from "../../scripts/daemon/template-renderer";
import type { DaemonTask } from "../../shared/contracts/task";

const templates = {
  defaultTemplate: "Context={{context}} Task={{task}} Unknown={{unknown}}",
  historyTemplate: "History={{history}} Context={{context}} Task={{task}}",
};

function createTask(overrides: Partial<DaemonTask> = {}): DaemonTask {
  return {
    id: "task-1",
    text: "Implement feature",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
    ...overrides,
  };
}

test("renderTaskPrompt chooses default template when includeHistory is false", () => {
  const prompt = renderTaskPrompt(createTask(), templates);

  assert.equal(prompt.includes("Context=/tmp/project"), true);
  assert.equal(prompt.includes("Task=Implement feature"), true);
  assert.equal(prompt.includes("History="), false);
});

test("renderTaskPrompt chooses history template when includeHistory is true", () => {
  const prompt = renderTaskPrompt(
    createTask({ includeHistory: true, history: "previous output" }),
    templates,
  );

  assert.equal(prompt.includes("History=previous output"), true);
  assert.equal(prompt.includes("Context=/tmp/project"), true);
});

test("renderTaskPrompt safely replaces unknown placeholders with empty strings", () => {
  const prompt = renderTaskPrompt(createTask(), templates);

  assert.equal(prompt.includes("Unknown="), true);
  assert.equal(prompt.includes("Unknown={{unknown}}"), false);
});

test("renderTaskPrompt validates required task fields", () => {
  assert.throws(
    () => renderTaskPrompt(createTask({ text: "   " }), templates),
    /missing required field: text/,
  );
  assert.throws(
    () => renderTaskPrompt(createTask({ contextPath: "" }), templates),
    /missing required field: contextPath/,
  );
});

test("renderTaskPrompt validates required placeholders in template", () => {
  assert.throws(
    () =>
      renderTaskPrompt(createTask(), {
        defaultTemplate: "Task={{task}}",
        historyTemplate: templates.historyTemplate,
      }),
    /missing required placeholder: \{\{context\}\}/,
  );
});
