import "dotenv/config";
import { defineConfig } from "prisma/config";

import { resolveSqliteConfig } from "./src/lib/sqlite-config";

const sqliteConfig = resolveSqliteConfig(process.env);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: sqliteConfig.databaseUrl,
  },
});
