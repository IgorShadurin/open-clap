import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { buildTaskMessage, executeTask } from "../../scripts/daemon/worker";
import type { DaemonTask } from "../../shared/contracts/task";

const templates = {
  defaultTemplate: "Context:\n{{context}}\nTask:\n{{task}}",
  historyTemplate: "History:\n{{history}}\nContext:\n{{context}}\nTask:\n{{task}}",
};

test("buildTaskMessage uses default template when history is disabled", () => {
  const task: DaemonTask = {
    id: "t1",
    text: "Do a thing",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };

  const message = buildTaskMessage(task, templates);
  assert.equal(message.includes("History"), false);
  assert.equal(message.includes("/tmp/project"), true);
  assert.equal(message.includes("Do a thing"), true);
});

test("buildTaskMessage uses history template when history is enabled", () => {
  const task: DaemonTask = {
    id: "t2",
    text: "Follow up",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: true,
    history: "previous message",
  };

  const message = buildTaskMessage(task, templates);
  assert.equal(message.includes("History"), true);
  assert.equal(message.includes("previous message"), true);
});

test("executeTask returns done result with full response", async () => {
  const task: DaemonTask = {
    id: "t3",
    text: "Execute",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };

  const result = await executeTask(task, templates, {
    codexCommandTemplate: 'codex exec -C "{{contextPath}}" --model "{{model}}" "{{message}}"',
    commandRunner: async () => ({
      code: 0,
      signal: null,
      stderr: "",
      stdout: "ok from codex",
    }),
  });

  assert.equal(result.status, "done");
  assert.equal(result.fullResponse.includes("ok from codex"), true);
  assert.equal(result.finishedAt instanceof Date, true);
});

test("executeTask returns failed result when codex command exits non-zero", async () => {
  const task: DaemonTask = {
    id: "t4",
    text: "Execute fail",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };

  const result = await executeTask(task, templates, {
    codexCommandTemplate: 'codex exec -C "{{contextPath}}" --model "{{model}}" "{{message}}"',
    commandRunner: async () => ({
      code: 2,
      signal: null,
      stderr: "command failed",
      stdout: "",
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.fullResponse.includes("Codex command failed"), true);
  assert.equal(result.fullResponse.includes("command failed"), true);
  assert.equal(result.finishedAt instanceof Date, true);
});

test("executeTask returns failed result when codex output indicates read-only sandbox", async () => {
  const task: DaemonTask = {
    id: "t5",
    text: "Create file",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };

  const result = await executeTask(task, templates, {
    commandRunner: async () => ({
      code: 0,
      signal: null,
      stderr: "",
      stdout: "I cannot complete this because write access is blocked by read-only sandbox.",
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.fullResponse.includes("not completed"), true);
  assert.equal(result.finishedAt instanceof Date, true);
});
