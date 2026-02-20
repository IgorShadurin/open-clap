import { NextResponse } from "next/server";
import path from "node:path";

import type { ApiErrorShape } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import {
  DEFAULT_CODEX_USAGE_TIMEOUT_MS,
  fetchCodexUsageForAuthFile,
  formatUsageReset,
  resolveAuthFilePath,
} from "../../../../lib/codex-usage";
import { getSettingValue } from "../../../../lib/settings-store";

export const runtime = "nodejs";

interface CodexUsageRequestBody {
  authFile?: string;
  authFiles?: string[];
  endpoint?: string;
  proxy?: string;
  timeoutMs?: number;
}

interface CodexUsageResultItem {
  authFile: string;
  endpoint?: string;
  error?: string;
  ok: boolean;
  refreshedToken?: boolean;
  usage?: {
    accountId?: string;
    allowed: boolean;
    fiveHourResetAt: string;
    fiveHourUsedPercent: number;
    planType?: string;
    weeklyResetAt: string;
    weeklyUsedPercent: number | null;
  };
}

interface CodexUsageResponseBody {
  results: CodexUsageResultItem[];
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

  const timeoutMs = body.timeoutMs ?? DEFAULT_CODEX_USAGE_TIMEOUT_MS;
  const endpoint =
    typeof body.endpoint === "string" && body.endpoint.trim().length > 0
      ? body.endpoint.trim()
      : undefined;

  const results: CodexUsageResultItem[] = [];
  for (const authFile of authFiles) {
    try {
      const result = await fetchCodexUsageForAuthFile({
        authFilePath: authFile,
        endpoint,
        proxyUrl: proxy.length > 0 ? proxy : undefined,
        timeoutMs,
      });
      const primary = result.usage.rate_limit?.primary_window;
      const secondary = result.usage.rate_limit?.secondary_window;

      results.push({
        authFile: result.absoluteAuthFilePath,
        endpoint: result.endpoint,
        ok: true,
        refreshedToken: result.refreshedToken,
        usage: {
          accountId: result.usage.account_id,
          allowed: Boolean(result.usage.rate_limit?.allowed),
          fiveHourResetAt: formatUsageReset(primary?.reset_at),
          fiveHourUsedPercent: primary?.used_percent ?? 0,
          planType: result.usage.plan_type,
          weeklyResetAt: formatUsageReset(secondary?.reset_at),
          weeklyUsedPercent:
            secondary?.used_percent === undefined ? null : secondary.used_percent,
        },
      });
    } catch (error) {
      results.push({
        authFile:
          typeof authFile === "string"
            ? (() => {
                try {
                  return resolveAuthFilePath(authFile);
                } catch {
                  return path.resolve(authFile);
                }
              })()
            : String(authFile),
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      });
    }
  }

  return NextResponse.json<CodexUsageResponseBody>({ results }, { status: 200 });
}
