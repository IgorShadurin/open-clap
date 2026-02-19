import assert from "node:assert/strict";
import path from "node:path";

const DEV_DB_PATH = path.resolve(process.cwd(), "data/codex-tasks.sqlite");

export function assertTestDatabaseGuard(): void {
  const sqliteDbPath = process.env.SQLITE_DB_PATH;
  const databaseUrl = process.env.DATABASE_URL;

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
}
