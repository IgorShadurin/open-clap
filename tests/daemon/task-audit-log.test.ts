import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createTaskAuditLogger, resolveDaemonLogFilePath } from "../../scripts/daemon/task-audit-log";

test("resolveDaemonLogFilePath defaults to date-based log file", () => {
  const filePath = resolveDaemonLogFilePath({}, new Date("2026-02-20T11:22:33.000Z"));
  assert.equal(
    filePath.endsWith(path.join("logs", "daemon", "2026", "02", "20.log")),
    true,
  );
});

test("resolveDaemonLogFilePath respects explicit DAEMON_LOG_FILE", () => {
  const filePath = resolveDaemonLogFilePath(
    { DAEMON_LOG_FILE: "logs/daemon/custom.log" },
    new Date("2026-02-20T11:22:33.000Z"),
  );
  assert.equal(filePath, path.resolve(process.cwd(), "logs/daemon/custom.log"));
});

test("createTaskAuditLogger creates directories and writes log lines", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclap-daemon-log-"));

  try {
    const filePath = path.join(tempDir, "nested", "2026", "02", "20.log");
    const logger = createTaskAuditLogger(filePath);
    logger.log("meta", "Daemon started", { hello: "world" }, new Date("2026-02-20T11:22:33.000Z"));

    const content = fs.readFileSync(filePath, "utf8");
    assert.equal(content.includes("[2026-02-20"), true);
    assert.equal(content.includes("ℹ️ Daemon started"), true);
    assert.equal(content.includes("\"hello\":\"world\""), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
