CREATE TABLE "CodexUsageCache" (
  "cacheKey" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "CodexUsageCache_expiresAt_idx" ON "CodexUsageCache"("expiresAt");
