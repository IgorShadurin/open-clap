import type { EnvMap } from "./settings";

export interface SqliteConfig {
  databaseUrl: string;
  sqliteFilePath: string;
  source: "sqlite_db_path" | "database_url" | "default";
}

const DEFAULT_SQLITE_PATH = "./data/codex-tasks.sqlite";

function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureFileDatabaseUrl(sqliteFilePath: string): string {
  return `file:${sqliteFilePath}`;
}

function parseSqlitePathFromDatabaseUrl(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith("file:")) {
    return null;
  }

  const path = databaseUrl.slice("file:".length);
  return path.length > 0 ? path : null;
}

export function resolveSqliteConfig(
  env: EnvMap = process.env,
): SqliteConfig {
  const sqliteDbPath = normalizeEnvValue(env.SQLITE_DB_PATH);
  if (sqliteDbPath) {
    return {
      databaseUrl: ensureFileDatabaseUrl(sqliteDbPath),
      sqliteFilePath: sqliteDbPath,
      source: "sqlite_db_path",
    };
  }

  const databaseUrl = normalizeEnvValue(env.DATABASE_URL);
  if (databaseUrl) {
    const sqliteFilePath = parseSqlitePathFromDatabaseUrl(databaseUrl);
    if (!sqliteFilePath) {
      throw new Error(
        "DATABASE_URL must use SQLite file format: file:<path-to-sqlite-db>",
      );
    }

    return {
      databaseUrl,
      sqliteFilePath,
      source: "database_url",
    };
  }

  return {
    databaseUrl: ensureFileDatabaseUrl(DEFAULT_SQLITE_PATH),
    sqliteFilePath: DEFAULT_SQLITE_PATH,
    source: "default",
  };
}
