import assert from "node:assert/strict";
import path from "node:path";

const DEV_DB_PATH = path.resolve(process.cwd(), "data/codex-tasks.sqlite");
const DEV_DAEMON_LOGS_DIR = path.resolve(process.cwd(), "logs", "daemon");

export function assertTestDatabaseGuard(): void {
  const sqliteDbPath = process.env.SQLITE_DB_PATH;
  const databaseUrl = process.env.DATABASE_URL;
  const daemonLogFile = process.env.DAEMON_LOG_FILE;
  const testTempDir = process.env.OPENCLAP_TEST_TMPDIR;

  assert.ok(
    sqliteDbPath,
    "SQLITE_DB_PATH is required for tests. Use the test runner helper.",
  );
  assert.ok(
    databaseUrl,
    "DATABASE_URL is required for tests. Use the test runner helper.",
  );

  const resolvedSqliteDbPath = path.resolve(sqliteDbPath);
  assert.notEqual(
    resolvedSqliteDbPath,
    DEV_DB_PATH,
    "Tests must not use the development database file",
  );
  assert.equal(
    databaseUrl,
    `file:${sqliteDbPath}`,
    "DATABASE_URL must point to the same file as SQLITE_DB_PATH",
  );

  assert.ok(
    testTempDir,
    "OPENCLAP_TEST_TMPDIR is required for tests. Use the test runner helper.",
  );
  assert.ok(
    daemonLogFile,
    "DAEMON_LOG_FILE is required for tests. Use the test runner helper.",
  );

  const resolvedTempDir = path.resolve(testTempDir);
  const resolvedDaemonLogFile = path.resolve(daemonLogFile);

  assert.equal(
    resolvedDaemonLogFile.startsWith(resolvedTempDir),
    true,
    "DAEMON_LOG_FILE must be written under OPENCLAP_TEST_TMPDIR",
  );
  assert.equal(
    resolvedDaemonLogFile.startsWith(DEV_DAEMON_LOGS_DIR),
    false,
    "Tests must not write daemon logs to the development log directory",
  );
}
