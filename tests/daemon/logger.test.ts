import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { formatLogLine, formatTimestamp } from "../../scripts/daemon/logger";

test("formatTimestamp uses [Y-m-d H:i:s] format", () => {
  const date = new Date("2026-02-19T13:05:09.000Z");
  const formatted = formatTimestamp(date);

  assert.match(formatted, /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/);
});

test("formatLogLine includes status emoji and message", () => {
  const date = new Date("2026-02-19T13:05:09.000Z");
  const line = formatLogLine("done", "Task completed", date);

  assert.match(line, /✅ Task completed$/);
});
