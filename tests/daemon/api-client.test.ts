import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { HttpDaemonApiClient } from "../../scripts/daemon/api-client";
import type { CodexUsageApiResponse } from "../../shared/contracts";

test("HttpDaemonApiClient uses /api/codex/usage without forceRefresh and parses model usage", async () => {
  const apiClient = new HttpDaemonApiClient("http://localhost:3002");
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: string | URL | globalThis.Request,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({
      init,
      input: typeof input === "string" ? input : String(input),
    });

    const body: CodexUsageApiResponse = {
      results: [
        {
          authFile: "/tmp/auth.json",
          ok: true,
          usage: {
            allowed: true,
            fiveHourResetAt: "n/a",
            fiveHourUsedPercent: 10,
            models: [
              {
                allowed: true,
                fiveHourResetAt: "n/a",
                fiveHourUsedPercent: 60,
                model: "gpt-5.3-codex-spark",
                weeklyResetAt: "n/a",
                weeklyUsedPercent: 50,
              },
            ],
            weeklyResetAt: "n/a",
            weeklyUsedPercent: 20,
          },
        },
      ],
    };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const usage = await apiClient.fetchCodexUsageState();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "http://localhost:3002/api/codex/usage");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.body, "{}");
    assert.equal(
      (calls[0]?.init?.headers as Record<string, string>)["Content-Type"],
      "application/json",
    );
    assert.equal(usage?.fiveHourUsedPercent, 10);
    assert.equal(usage?.allowed, true);
    assert.equal(usage?.weeklyUsedPercent, 20);
    assert.equal(usage?.models?.[0]?.model, "gpt-5.3-codex-spark");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
