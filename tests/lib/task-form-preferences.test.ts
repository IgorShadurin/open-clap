import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  clearTaskFormPreferences,
  DEFAULT_TASK_FORM_PREFERENCES,
  getTaskFormPreferencesStorageKey,
  loadTaskFormPreferences,
  saveTaskFormPreferences,
} from "../../src/lib/task-form-preferences";

interface MemoryStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

function createMemoryStorage(): MemoryStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

test("loadTaskFormPreferences returns defaults when no data is saved", () => {
  const storage = createMemoryStorage();
  assert.deepEqual(
    loadTaskFormPreferences("project-alpha", storage),
    DEFAULT_TASK_FORM_PREFERENCES,
  );
});

test("loadTaskFormPreferences falls back to defaults for malformed values", () => {
  const storage = createMemoryStorage();
  const storageKey = getTaskFormPreferencesStorageKey("project-alpha");
  assert.ok(storageKey);

  storage.setItem(
    storageKey,
    JSON.stringify({
      contextCount: -10,
      includeContext: "yes",
      model: "   ",
      reasoning: "unsupported",
    }),
  );

  assert.deepEqual(
    loadTaskFormPreferences("project-alpha", storage),
    DEFAULT_TASK_FORM_PREFERENCES,
  );
});

test("saveTaskFormPreferences normalizes and persists values per project", () => {
  const storage = createMemoryStorage();
  const saved = saveTaskFormPreferences(
    "project-alpha",
    {
      contextCount: 3.8,
      includeContext: true,
      model: " custom-model ",
      reasoning: "high",
    },
    storage,
  );

  assert.deepEqual(saved, {
    contextCount: 3,
    includeContext: true,
    model: "custom-model",
    reasoning: "high",
  });
  assert.deepEqual(loadTaskFormPreferences("project-alpha", storage), saved);
  assert.deepEqual(
    loadTaskFormPreferences("project-bravo", storage),
    DEFAULT_TASK_FORM_PREFERENCES,
  );
});

test("clearTaskFormPreferences removes only the requested project key", () => {
  const storage = createMemoryStorage();

  saveTaskFormPreferences(
    "project-alpha",
    {
      contextCount: 2,
      includeContext: true,
      model: "gpt-5.3-codex",
      reasoning: "medium",
    },
    storage,
  );

  saveTaskFormPreferences(
    "project-bravo",
    {
      contextCount: 7,
      includeContext: false,
      model: "gpt-5.3-codex",
      reasoning: "low",
    },
    storage,
  );

  clearTaskFormPreferences("project-alpha", storage);

  assert.deepEqual(
    loadTaskFormPreferences("project-alpha", storage),
    DEFAULT_TASK_FORM_PREFERENCES,
  );
  assert.deepEqual(loadTaskFormPreferences("project-bravo", storage), {
    contextCount: 7,
    includeContext: false,
    model: "gpt-5.3-codex",
    reasoning: "low",
  });
});
