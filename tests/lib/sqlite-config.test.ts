import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { resolveSqliteConfig } from "../../src/lib/sqlite-config";

test("resolveSqliteConfig uses SQLITE_DB_PATH when provided", () => {
  const config = resolveSqliteConfig({
    SQLITE_DB_PATH: "./tmp/local.sqlite",
    DATABASE_URL: "file:./ignored.sqlite",
  });

  assert.deepEqual(config, {
    databaseUrl: "file:./tmp/local.sqlite",
    sqliteFilePath: "./tmp/local.sqlite",
    source: "sqlite_db_path",
  });
});

test("resolveSqliteConfig falls back to DATABASE_URL when SQLITE_DB_PATH is absent", () => {
  const config = resolveSqliteConfig({
    DATABASE_URL: "file:./db/custom.sqlite",
  });

  assert.deepEqual(config, {
    databaseUrl: "file:./db/custom.sqlite",
    sqliteFilePath: "./db/custom.sqlite",
    source: "database_url",
  });
});

test("resolveSqliteConfig uses default sqlite path when env values are missing", () => {
  const config = resolveSqliteConfig({});

  assert.deepEqual(config, {
    databaseUrl: "file:./data/codex-tasks.sqlite",
    sqliteFilePath: "./data/codex-tasks.sqlite",
    source: "default",
  });
});

test("resolveSqliteConfig rejects non-sqlite DATABASE_URL values", () => {
  assert.throws(
    () =>
      resolveSqliteConfig({
        DATABASE_URL: "postgres://localhost:5432/app",
      }),
    /DATABASE_URL must use SQLite file format/,
  );
});
