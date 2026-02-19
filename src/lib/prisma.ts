import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { resolveSqliteConfig } from "./sqlite-config";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const sqliteConfig = resolveSqliteConfig();
const sqliteAdapter = new PrismaBetterSqlite3({ url: sqliteConfig.databaseUrl });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: sqliteAdapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
