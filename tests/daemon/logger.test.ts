import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { createLogger, formatLogLine, formatTimestamp } from "../../scripts/daemon/logger";

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

test("createLogger suppresses duplicate waiting messages until state changes", () => {
  const lines: string[] = [];
  const logger = createLogger((line) => {
    lines.push(line);
  });

  logger.log("waiting", "No queued tasks available", new Date("2026-02-20T09:38:00.000Z"));
  logger.log("waiting", "No queued tasks available", new Date("2026-02-20T09:38:01.000Z"));
  logger.log("waiting", "No queued tasks available", new Date("2026-02-20T09:38:02.000Z"));
  logger.log("running", "Started 1 task(s) out of 1 fetched", new Date("2026-02-20T09:38:03.000Z"));
  logger.log("waiting", "No queued tasks available", new Date("2026-02-20T09:38:04.000Z"));

  assert.equal(lines.length, 3);
  assert.match(lines[0] ?? "", /🕒 No queued tasks available$/);
  assert.match(lines[1] ?? "", /🚀 Started 1 task\(s\) out of 1 fetched$/);
  assert.match(lines[2] ?? "", /🕒 No queued tasks available$/);
});
