import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Prisma } from "@prisma/client";

import type {
  ApiErrorShape,
  CodexUsageApiResponse,
  CodexUsageApiResult,
  CodexUsageModelSummary,
} from "../../../../../shared/contracts";
import type { CodexUsagePayload } from "../../../../lib/codex-usage";
import { createApiError } from "../../../../lib/api-error";
import * as codexUsage from "../../../../lib/codex-usage";
import { prisma } from "../../../../lib/prisma";
import { getSettingValue } from "../../../../lib/settings-store";

export const runtime = "nodejs";
const CODEX_USAGE_CACHE_TTL_MS = 5 * 60 * 1000;

interface CodexUsageRequestBody {
  authFile?: string;
  authFiles?: string[];
  endpoint?: string;
  forceRefresh?: boolean;
  proxy?: string;
  timeoutMs?: number;
}

interface CodexUsageCachePayload {
  results: CodexUsageApiResult[];
}

function normalizeAuthFiles(body: CodexUsageRequestBody): string[] {
  const list: string[] = [];
  if (typeof body.authFile === "string" && body.authFile.trim().length > 0) {
    list.push(body.authFile.trim());
  }

  if (Array.isArray(body.authFiles)) {
    for (const item of body.authFiles) {
      if (typeof item === "string" && item.trim().length > 0) {
        list.push(item.trim());
      }
    }
  }

  return [...new Set(list)];
}

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

function parseCachedPayload(input: Prisma.JsonValue): CodexUsageApiResponse | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const payload = input as Partial<CodexUsageCachePayload>;
  if (!Array.isArray(payload.results)) {
    return null;
  }

  return { results: payload.results };
}

function buildLegacyUsageFromRateLimit(
  usage: CodexUsagePayload,
  primaryModelUsage: CodexUsageModelSummary | undefined,
) {
  const primaryWindow = usage.rate_limit?.primary_window;
  const secondaryWindow = usage.rate_limit?.secondary_window;

  return {
    accountId: usage.account_id,
    allowed: Boolean(usage.rate_limit?.allowed),
    fiveHourResetAt: codexUsage.formatUsageReset(primaryWindow?.reset_at),
    fiveHourUsedPercent: primaryWindow?.used_percent ?? 0,
    planType: usage.plan_type,
    weeklyResetAt: codexUsage.formatUsageReset(secondaryWindow?.reset_at),
    weeklyUsedPercent: secondaryWindow?.used_percent ?? null,
    ...(primaryModelUsage
      ? {
          allowed: primaryModelUsage.allowed,
          fiveHourResetAt: primaryModelUsage.fiveHourResetAt,
          fiveHourUsedPercent: primaryModelUsage.fiveHourUsedPercent,
          weeklyResetAt: primaryModelUsage.weeklyResetAt,
          weeklyUsedPercent: primaryModelUsage.weeklyUsedPercent,
          planType: primaryModelUsage.planType ?? usage.plan_type,
        }
      : {}),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CodexUsageRequestBody;
  try {
    body = (await request.json()) as CodexUsageRequestBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  let authFiles = normalizeAuthFiles(body);
  if (authFiles.length < 1) {
    try {
      authFiles = [await getSettingValue("codex_usage_auth_file")];
    } catch (error) {
      return NextResponse.json<ApiErrorShape>(
        createApiError(
          "INVALID_PAYLOAD",
          "Auth file is not provided and setting `codex_usage_auth_file` could not be resolved",
          error instanceof Error ? error.message : String(error),
        ),
        { status: 400 },
      );
    }
  }

  const directProxy = typeof body.proxy === "string" ? body.proxy.trim() : "";
  let settingsProxyEnabled = false;
  let settingsProxyUrl = "";
  try {
    const rawProxyEnabled = await getSettingValue("codex_usage_proxy_enabled");
    settingsProxyEnabled = rawProxyEnabled.trim().toLowerCase() === "true";
    settingsProxyUrl = (await getSettingValue("codex_usage_proxy_url")).trim();
  } catch (error) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Proxy settings could not be resolved from settings storage",
        error instanceof Error ? error.message : String(error),
      ),
      { status: 400 },
    );
  }

  const proxy = directProxy || (settingsProxyEnabled ? settingsProxyUrl : "");

  if (settingsProxyEnabled && proxy.length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Proxy is enabled but codex_usage_proxy_url is empty",
      ),
      { status: 400 },
    );
  }

  if (
    body.timeoutMs !== undefined &&
    (!Number.isFinite(body.timeoutMs) || body.timeoutMs <= 0)
  ) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `timeoutMs` must be a positive number"),
      { status: 400 },
    );
  }

  const timeoutMs = body.timeoutMs ?? codexUsage.DEFAULT_CODEX_USAGE_TIMEOUT_MS;
  const endpoint =
    typeof body.endpoint === "string" && body.endpoint.trim().length > 0
      ? body.endpoint.trim()
      : undefined;

  const resolvedAuthFiles = authFiles.map((authFile) => {
    try {
      return codexUsage.resolveAuthFilePath(authFile);
    } catch {
      return path.resolve(authFile);
    }
  });

  const cacheKey = buildCacheKey({
    authFiles: resolvedAuthFiles,
    endpoint,
    proxy: proxy.length > 0 ? proxy : undefined,
  });

  if (!body.forceRefresh) {
    const cached = await prisma.codexUsageCache.findUnique({
      where: { cacheKey },
    });
    if (cached && cached.expiresAt.getTime() > Date.now()) {
      const payload = parseCachedPayload(cached.payload as Prisma.JsonValue);
      if (payload) {
        return NextResponse.json<CodexUsageApiResponse>(payload, { status: 200 });
      }
    }
  }

  const results: CodexUsageApiResult[] = [];
  for (const authFilePath of resolvedAuthFiles) {
    try {
      const result = await codexUsage.fetchCodexUsageForAuthFile({
        authFilePath,
        endpoint,
        proxyUrl: proxy.length > 0 ? proxy : undefined,
        timeoutMs,
      });
      const modelSummaries = codexUsage.extractCodexUsageModelSummaries(result.usage);
      const primaryModelUsage = modelSummaries[0];

      results.push({
        authFile: result.absoluteAuthFilePath,
        endpoint: result.endpoint,
        ok: true,
        refreshedToken: result.refreshedToken,
        usage: {
          ...(modelSummaries.length > 0 ? { models: modelSummaries } : {}),
          ...buildLegacyUsageFromRateLimit(result.usage, primaryModelUsage),
        },
      });
    } catch (error) {
      results.push({
        authFile: authFilePath,
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      });
    }
  }

  const responseBody: CodexUsageApiResponse = { results };

  if (results.some((item) => item.ok)) {
    const now = Date.now();
    const expiresAt = new Date(now + CODEX_USAGE_CACHE_TTL_MS);
    await prisma.$transaction([
      prisma.codexUsageCache.upsert({
        create: {
          cacheKey,
          expiresAt,
          payload: responseBody as unknown as Prisma.InputJsonValue,
        },
        update: {
          expiresAt,
          payload: responseBody as unknown as Prisma.InputJsonValue,
        },
        where: { cacheKey },
      }),
      prisma.codexUsageCache.deleteMany({
        where: {
          expiresAt: {
            lte: new Date(now),
          },
        },
      }),
    ]);
  }

  return NextResponse.json<CodexUsageApiResponse>(responseBody, { status: 200 });
}
