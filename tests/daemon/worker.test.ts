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

test("executeTask enforces command timeout for a single task", async () => {
  const task: DaemonTask = {
    id: "t-timeout-single",
    text: "Timeout single task",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex-spark",
    reasoning: "medium",
    includeHistory: false,
  };

  const timeoutEvents: string[] = [];
  const result = await executeTask(task, templates, {
    commandRunner: async (_command, options) => {
      await new Promise<void>((resolve) => {
        const signal = options?.signal;
        if (!signal || signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return {
        code: -1,
        signal: "SIGTERM",
        stderr: "",
        stdout: "",
      };
    },
    onCommandTimeout: (event) => {
      timeoutEvents.push(`${event.variantLabel}:${event.attempt}`);
    },
    taskTimeoutMs: 10,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.fullResponse.includes("timed out after 10ms"), true);
  assert.deepEqual(timeoutEvents, ["single:1"]);
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

test("executeTask ignores code-like create-failure phrases inside stderr logs", async () => {
  const task: DaemonTask = {
    id: "t6",
    text: "Implement feature",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };

  const result = await executeTask(task, templates, {
    commandRunner: async () => ({
      code: 0,
      signal: null,
      stderr:
        'case .noClipData:\n  return "Could not create a valid clip from the selected range."\n' +
        'test("cannot create subproject using same directory", () => {})',
      stdout: "Implemented.\nAll requested changes are now in place.",
    }),
  });

  assert.equal(result.status, "done");
  assert.equal(result.fullResponse.includes("Implemented"), true);
  assert.equal(result.finishedAt instanceof Date, true);
});

test("executeTask returns failed result for explicit inability language", async () => {
  const task: DaemonTask = {
    id: "t7",
    text: "Implement feature",
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
      stdout: "I could not complete this task because write access is blocked.",
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.fullResponse.includes("not completed"), true);
  assert.equal(result.finishedAt instanceof Date, true);
});

test("executeTask returns failed result from stderr semantic failure when stdout is empty", async () => {
  const task: DaemonTask = {
    id: "t8",
    text: "Implement feature",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };

  const result = await executeTask(task, templates, {
    commandRunner: async () => ({
      code: 0,
      signal: null,
      stderr: "Permission denied while writing to the workspace.",
      stdout: "",
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.fullResponse.includes("permission denied"), true);
  assert.equal(result.finishedAt instanceof Date, true);
});

test("executeTask runs list tasks once per list item with item-specific replacement", async () => {
  const task: DaemonTask = {
    id: "t-list-1",
    text: "Translate for $list-ios-langs",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
    listExecution: {
      listId: "ios-langs",
      items: ["en-US", "fr-FR", "ja"],
    },
  };

  const commands: string[] = [];
  const result = await executeTask(task, templates, {
    codexCommandTemplate: 'codex exec -C "{{contextPath}}" --model "{{model}}" "{{message}}"',
    commandRunner: async (command) => {
      commands.push(command);
      return {
        code: 0,
        signal: null,
        stderr: "",
        stdout: "ok",
      };
    },
  });

  assert.equal(result.status, "done");
  assert.equal(commands.length, 3);
  assert.equal(commands.some((command) => command.includes("$list-ios-langs")), false);
  assert.equal(commands[0]?.includes("en-US"), true);
  assert.equal(commands[1]?.includes("fr-FR"), true);
  assert.equal(commands[2]?.includes("ja"), true);
});

test("executeTask retries failed list subtask once and continues other subtasks", async () => {
  const task: DaemonTask = {
    id: "t-list-2",
    text: "Translate for $list-ios-langs",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
    listExecution: {
      listId: "ios-langs",
      items: ["en-US", "fr-FR"],
    },
  };

  let invocation = 0;
  const result = await executeTask(task, templates, {
    commandRunner: async () => {
      invocation += 1;
      if (invocation === 1 || invocation === 2) {
        return {
          code: 2,
          signal: null,
          stderr: "failed",
          stdout: "",
        };
      }

      return {
        code: 0,
        signal: null,
        stderr: "",
        stdout: "ok",
      };
    },
  });

  assert.equal(result.status, "done");
  assert.equal(invocation, 3);
  assert.equal(result.fullResponse.includes("failed=1"), true);
  assert.equal(result.fullResponse.includes("status=failed attempts=2"), true);
  assert.equal(result.fullResponse.includes("status=done attempts=1"), true);
});

test("executeTask uses list item count even when the same $list-* token appears multiple times", async () => {
  const task: DaemonTask = {
    id: "t-list-repeat",
    text: "One $list-ios-langs Two $list-ios-langs Three $list-ios-langs",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
    listExecution: {
      listId: "ios-langs",
      items: ["en-US", "fr-FR"],
    },
  };

  const commands: string[] = [];
  const result = await executeTask(task, templates, {
    commandRunner: async (command) => {
      commands.push(command);
      return {
        code: 0,
        signal: null,
        stderr: "",
        stdout: "ok",
      };
    },
  });

  assert.equal(result.status, "done");
  assert.equal(commands.length, 2);
  assert.equal(commands[0]?.includes("en-US"), true);
  assert.equal(commands[1]?.includes("fr-FR"), true);
  assert.equal(commands.some((command) => command.includes("$list-ios-langs")), false);
});

test("executeTask emits list subtask progress events with duration", async () => {
  const task: DaemonTask = {
    id: "t-list-progress",
    text: "Translate for $list-ios-langs",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
    listExecution: {
      listId: "ios-langs",
      items: ["en-US", "fr-FR"],
    },
  };

  const progressEvents: Array<{
    attempts: number;
    current: number;
    durationMs: number;
    listId: string;
    status: "done" | "failed";
    total: number;
  }> = [];

  const result = await executeTask(task, templates, {
    commandRunner: async () => ({
      code: 0,
      signal: null,
      stderr: "",
      stdout: "ok",
    }),
    onListSubtaskComplete: (event) => {
      progressEvents.push({
        attempts: event.attempts,
        current: event.current,
        durationMs: event.durationMs,
        listId: event.listId,
        status: event.status,
        total: event.total,
      });
    },
  });

  assert.equal(result.status, "done");
  assert.equal(progressEvents.length, 2);
  assert.deepEqual(progressEvents.map((event) => event.current), [1, 2]);
  assert.equal(progressEvents.every((event) => event.total === 2), true);
  assert.equal(progressEvents.every((event) => event.listId === "ios-langs"), true);
  assert.equal(progressEvents.every((event) => event.status === "done"), true);
  assert.equal(progressEvents.every((event) => event.attempts === 1), true);
  assert.equal(progressEvents.every((event) => event.durationMs >= 0), true);
});

test("executeTask applies timeout per list subtask and continues remaining items", async () => {
  const task: DaemonTask = {
    id: "t-list-timeout-per-item",
    text: "Translate for $list-ios-langs",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex-spark",
    reasoning: "medium",
    includeHistory: false,
    listExecution: {
      listId: "ios-langs",
      items: ["en-US", "fr-FR"],
    },
  };

  const timeoutEvents: Array<{ attempt: number; variantLabel: string }> = [];
  const progressEvents: Array<{
    attempts: number;
    current: number;
    durationMs: number;
    status: "done" | "failed";
  }> = [];

  const result = await executeTask(task, templates, {
    commandRunner: async (_command, options) => {
      await new Promise<void>((resolve) => {
        const signal = options?.signal;
        if (!signal || signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return {
        code: -1,
        signal: "SIGTERM",
        stderr: "",
        stdout: "",
      };
    },
    onCommandTimeout: (event) => {
      timeoutEvents.push({ attempt: event.attempt, variantLabel: event.variantLabel });
    },
    onListSubtaskComplete: (event) => {
      progressEvents.push({
        attempts: event.attempts,
        current: event.current,
        durationMs: event.durationMs,
        status: event.status,
      });
    },
    taskTimeoutMs: 10,
  });

  assert.equal(result.status, "done");
  assert.equal(result.fullResponse.includes("failed=2"), true);
  assert.equal(timeoutEvents.length, 4);
  assert.deepEqual(timeoutEvents.map((event) => event.variantLabel), ["1/2", "1/2", "2/2", "2/2"]);
  assert.deepEqual(timeoutEvents.map((event) => event.attempt), [1, 2, 1, 2]);
  assert.deepEqual(progressEvents.map((event) => event.current), [1, 2]);
  assert.equal(progressEvents.every((event) => event.status === "failed"), true);
  assert.equal(progressEvents.every((event) => event.attempts === 2), true);
  assert.equal(progressEvents.every((event) => event.durationMs > 0), true);
});

test("executeTask rejects tasks that reference multiple list types", async () => {
  const task: DaemonTask = {
    id: "t-list-multi",
    text: "Run for $list-ios-langs and $list-country-codes",
    contextPath: "/tmp/project",
    model: "gpt-5.3-codex",
    reasoning: "high",
    includeHistory: false,
  };

  let called = false;
  const result = await executeTask(task, templates, {
    commandRunner: async () => {
      called = true;
      return {
        code: 0,
        signal: null,
        stderr: "",
        stdout: "ok",
      };
    },
  });

  assert.equal(called, false);
  assert.equal(result.status, "failed");
  assert.equal(result.fullResponse.includes("Task can reference only one list type"), true);
  assert.equal(result.fullResponse.includes("$list-ios-langs"), true);
  assert.equal(result.fullResponse.includes("$list-country-codes"), true);
});
