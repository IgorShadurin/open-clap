import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";

import { prisma } from "../../src/lib/prisma";
import { POST as codexUsagePost } from "../../src/app/api/codex/usage/route";

function buildCacheKey(input: {
  authFiles: string[];
  endpoint?: string;
  proxy?: string;
}): string {
  const payload = {
    authFiles: input.authFiles,
    endpoint: input.endpoint ?? null,
    proxy: input.proxy ?? null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function resetDatabase(): Promise<void> {
  await prisma.codexUsageCache.deleteMany();
}

test.after(async () => {
  await resetDatabase();
});

test("codex usage API returns cached payload when cache is fresh", async () => {
  await resetDatabase();
  const authFile = "/tmp/codex-usage-cache-test-auth.json";
  const resolvedAuthFile = path.resolve(authFile);
  const cacheKey = buildCacheKey({ authFiles: [resolvedAuthFile] });

  await prisma.codexUsageCache.create({
    data: {
      cacheKey,
      expiresAt: new Date(Date.now() + 60_000),
      payload: {
        results: [
          {
            authFile: resolvedAuthFile,
            ok: true,
            usage: {
              allowed: true,
              fiveHourResetAt: "n/a",
              fiveHourUsedPercent: 12,
              weeklyResetAt: "n/a",
              weeklyUsedPercent: 34,
            },
          },
        ],
      },
    },
  });

  const response = await codexUsagePost(
    new Request("http://localhost/api/codex/usage", {
      body: JSON.stringify({ authFile }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    results: Array<{
      authFile: string;
      ok: boolean;
      usage?: { fiveHourUsedPercent?: number };
    }>;
  };
  assert.equal(payload.results[0]?.ok, true);
  assert.equal(payload.results[0]?.authFile, resolvedAuthFile);
  assert.equal(payload.results[0]?.usage?.fiveHourUsedPercent, 12);
});

test("codex usage API does not use stale cache when entry is expired", async () => {
  await resetDatabase();
  const authFile = "/tmp/codex-usage-cache-test-expired-auth.json";
  const resolvedAuthFile = path.resolve(authFile);
  const cacheKey = buildCacheKey({ authFiles: [resolvedAuthFile] });

  await prisma.codexUsageCache.create({
    data: {
      cacheKey,
      expiresAt: new Date(Date.now() - 60_000),
      payload: {
        results: [
          {
            authFile: resolvedAuthFile,
            ok: true,
            usage: {
              allowed: true,
              fiveHourResetAt: "n/a",
              fiveHourUsedPercent: 7,
              weeklyResetAt: "n/a",
              weeklyUsedPercent: 11,
            },
          },
        ],
      },
    },
  });

  const response = await codexUsagePost(
    new Request("http://localhost/api/codex/usage", {
      body: JSON.stringify({ authFile }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    results: Array<{
      error?: string;
      ok: boolean;
      usage?: { fiveHourUsedPercent?: number };
    }>;
  };
  assert.equal(payload.results[0]?.ok, false);
  assert.equal(payload.results[0]?.usage?.fiveHourUsedPercent, undefined);
  assert.equal(typeof payload.results[0]?.error, "string");
});
