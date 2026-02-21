import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";
import type { CodexUsageModelSummary } from "../../shared/contracts";

export type CodexUsageWindow = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
} | null;

export type CodexUsageRateLimit = {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: CodexUsageWindow;
  secondary_window?: CodexUsageWindow;
};

export type CodexUsagePayload = {
  email?: string;
  account_id?: string;
  plan_type?: string;
  rate_limit?: CodexUsageRateLimit;
  additional_rate_limits?: unknown;
};

type AuthFileShape = {
  tokens?: {
    access_token?: string;
    refresh_token?: string;
  };
};

type ProxyInfo = {
  host: string;
  port: number;
  authHeader?: string;
};

type HttpJsonResponse<T> = {
  statusCode: number;
  headers: Record<string, string>;
  json: T;
};

export type FetchCodexUsageInput = {
  authFilePath: string;
  endpoint?: string | null;
  proxyUrl?: string | null;
  timeoutMs?: number;
};

export type FetchCodexUsageResult = {
  absoluteAuthFilePath: string;
  endpoint: string;
  refreshedToken: boolean;
  usage: CodexUsagePayload;
};

type UnknownRecord = Record<string, unknown>;

type UsageWindowSource = {
  usedPercent: number;
  resetAt: string;
};

const MODEL_SUMMARY_PRIMARY_WINDOW_KEYS = [
  "primary_window",
  "five_hour_window",
] as const;

const MODEL_SUMMARY_SECONDARY_WINDOW_KEYS = [
  "secondary_window",
  "weekly_window",
] as const;

const RATE_LIMIT_RESERVED_KEYS = new Set([
  "allowed",
  "limit_reached",
  "plan_type",
  "primary_window",
  "secondary_window",
  "models",
  "additional_rate_limits",
]);

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length < 1 ? null : normalized;
}

function readPercent(value: unknown): number | null {
  return parseNumeric(value);
}

function readWindow(source: UnknownRecord, keys: readonly string[]): UsageWindowSource | null {
  for (const key of keys) {
    const rawWindow = source[key];
    const windowRecord = asRecord(rawWindow);
    if (!windowRecord) {
      continue;
    }

    const usedPercent = readPercent(windowRecord.used_percent) ?? 0;
    const resetAt = formatUsageReset(
      parseNumeric(windowRecord.reset_at) as number | null | undefined,
    );

    return {
      resetAt,
      usedPercent,
    };
  }

  return null;
}

function normalizeModelSummary(summary: CodexUsageModelSummary): CodexUsageModelSummary {
  return {
    ...summary,
    fiveHourUsedPercent: Number.isFinite(summary.fiveHourUsedPercent)
      ? summary.fiveHourUsedPercent
      : 0,
    weeklyUsedPercent: Number.isFinite(summary.weeklyUsedPercent) ? summary.weeklyUsedPercent : null,
  };
}

function toCanonicalModelIdentifier(value: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function parseRateLimitSummarySource(value: unknown): UnknownRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const nested = asRecord(record.rate_limit);
  if (nested) {
    return nested;
  }

  const keys = ["used_percent", "primary_window", "secondary_window", "allowed", "limit_reached"];
  if (keys.some((key) => key in record)) {
    return record;
  }

  return null;
}

function parseModelUsageSummary(
  modelData: UnknownRecord,
  fallbackModel: string | null,
  defaultModelMeta: {
    allowed: boolean;
    planType?: string;
  },
): CodexUsageModelSummary | null {
  const primaryWindow = readWindow(modelData, MODEL_SUMMARY_PRIMARY_WINDOW_KEYS);
  const secondaryWindow = readWindow(modelData, MODEL_SUMMARY_SECONDARY_WINDOW_KEYS);

  const modelName =
    readString(modelData.model) ??
    readString(modelData.model_name) ??
    fallbackModel ??
    readString(modelData.name);
  if (!modelName) {
    return null;
  }

  const weeklyUsedPercent = readPercent(
    modelData.weeklyUsedPercent ??
      modelData.secondary_used_percent ??
      (secondaryWindow ? secondaryWindow.usedPercent : null),
  );

  return normalizeModelSummary({
    allowed: Boolean(modelData.allowed ?? defaultModelMeta.allowed),
    fiveHourResetAt: primaryWindow?.resetAt ?? "n/a",
    fiveHourUsedPercent: primaryWindow?.usedPercent ?? 0,
    model: modelName,
    modelLabel: readString(modelData.modelLabel) ?? readString(modelData.model_name_label),
    planType: readString(modelData.plan_type) ?? defaultModelMeta.planType,
    weeklyResetAt: secondaryWindow?.resetAt ?? "n/a",
    weeklyUsedPercent: weeklyUsedPercent ?? (secondaryWindow ? secondaryWindow.usedPercent : null),
  });
}

function inferSingleModelSummary(
  payload: UnknownRecord,
  defaultModelMeta: {
    allowed: boolean;
    planType?: string;
  },
): CodexUsageModelSummary {
  const primaryWindow = readWindow(payload, MODEL_SUMMARY_PRIMARY_WINDOW_KEYS);
  const secondaryWindow = readWindow(payload, MODEL_SUMMARY_SECONDARY_WINDOW_KEYS);

  return {
    allowed: defaultModelMeta.allowed,
    fiveHourResetAt: primaryWindow?.resetAt ?? "n/a",
    fiveHourUsedPercent: primaryWindow?.usedPercent ?? 0,
    model: "default",
    planType: defaultModelMeta.planType,
    weeklyResetAt: secondaryWindow?.resetAt ?? "n/a",
    weeklyUsedPercent: secondaryWindow ? secondaryWindow.usedPercent : null,
  };
}

function parseAdditionalRateLimitEntries(
  payload: UnknownRecord,
  defaultModelMeta: {
    allowed: boolean;
    planType?: string;
  },
): CodexUsageModelSummary[] {
  const details = payload.additional_rate_limits;
  if (!details) {
    return [];
  }

  const extracted: CodexUsageModelSummary[] = [];
  const seenModels = new Set<string>();
  const detailItems: Array<{ detail: UnknownRecord; modelKey?: string }> = [];

  if (Array.isArray(details)) {
    for (const rawDetail of details) {
      const detailRecord = asRecord(rawDetail);
      if (!detailRecord) {
        continue;
      }

      detailItems.push({ detail: detailRecord });
    }
  } else {
    const rawDetails = asRecord(details);
    if (!rawDetails) {
      return [];
    }

    for (const [modelKey, rawDetail] of Object.entries(rawDetails)) {
      const detailRecord = asRecord(rawDetail);
      if (!detailRecord) {
        continue;
      }

      detailItems.push({ detail: detailRecord, modelKey });
    }
  }

  for (const { detail: detailRecord, modelKey } of detailItems) {
    const modelName =
      readString(detailRecord.metered_feature) ??
      readString(detailRecord.model) ??
      readString(detailRecord.model_name) ??
      readString(detailRecord.limitName) ??
      modelKey ??
      readString(detailRecord.limit_name);

    if (!modelName) {
      continue;
    }

    const rawRateLimit = parseRateLimitSummarySource(detailRecord);
    const parsed = parseModelUsageSummary(
      rawRateLimit ?? {},
      modelName,
      defaultModelMeta,
    );
    if (!parsed) {
      continue;
    }

    const modelLabel =
      readString(detailRecord.limit_name) ??
      readString(detailRecord.model_name_label) ??
      parsed.modelLabel;
    const summary: CodexUsageModelSummary = {
      ...parsed,
      modelLabel,
    };

    const dedupeKey = toCanonicalModelIdentifier(summary.model);
    if (!dedupeKey) {
      continue;
    }

    if (!seenModels.has(dedupeKey)) {
      seenModels.add(dedupeKey);
      extracted.push(summary);
    }
  }

  return extracted;
}

export function extractCodexUsageModelSummaries(
  payload: CodexUsagePayload,
): CodexUsageModelSummary[] {
  const rateLimit = asRecord(payload.rate_limit);
  if (!rateLimit) {
    return [];
  }

  const extracted: CodexUsageModelSummary[] = [];
  const seenModels = new Set<string>();
  const defaultModelMeta = {
    allowed: Boolean(rateLimit.allowed),
    planType: readString(payload.plan_type) ?? undefined,
  };
  const pushSummary = (summary: CodexUsageModelSummary) => {
    if (!seenModels.has(summary.model)) {
      seenModels.add(summary.model);
      extracted.push(summary);
    }
  };

  const modelEntries = rateLimit.models;
  const hasExplicitModelEntries =
    Array.isArray(modelEntries) || asRecord(modelEntries) !== null;

  if (Array.isArray(modelEntries)) {
    for (const item of modelEntries) {
      const modelRecord = asRecord(item);
      if (!modelRecord) {
        continue;
      }

      const summary = parseModelUsageSummary(modelRecord, null, defaultModelMeta);
      if (summary) {
        pushSummary(summary);
      }
    }
  }

  if (asRecord(modelEntries) !== null) {
    for (const [modelKey, raw] of Object.entries(modelEntries as UnknownRecord)) {
      const modelRecord = asRecord(raw);
      if (!modelRecord) {
        continue;
      }
      const summary = parseModelUsageSummary(modelRecord, modelKey, defaultModelMeta);
      if (summary) {
        pushSummary(summary);
      }
    }
  }

  if (!hasExplicitModelEntries) {
    const directSummary = parseModelUsageSummary(rateLimit, null, defaultModelMeta);
    if (directSummary) {
      pushSummary(directSummary);
    } else {
      pushSummary(inferSingleModelSummary(rateLimit, defaultModelMeta));
    }
  }

  const additionalRateLimitSummaries = parseAdditionalRateLimitEntries(payload as UnknownRecord, {
    allowed: defaultModelMeta.allowed,
    planType: defaultModelMeta.planType,
  });
  for (const summary of additionalRateLimitSummaries) {
    pushSummary(summary);
  }

  if (extracted.length > 0) {
    return extracted;
  }

  const fallback = inferSingleModelSummary(rateLimit, {
    allowed: defaultModelMeta.allowed,
    planType: defaultModelMeta.planType,
  });
  const fallbackModel = readString((payload as UnknownRecord).model) ?? readString(rateLimit.model);
  if (fallbackModel) {
    return [{ ...fallback, model: fallbackModel }];
  }

  if (extracted.length > 0) {
    return extracted;
  }

  for (const [modelName, rawModel] of Object.entries(rateLimit)) {
    if (RATE_LIMIT_RESERVED_KEYS.has(modelName)) {
      continue;
    }
    const modelRecord = asRecord(rawModel);
    if (!modelRecord) {
      continue;
    }
    const summary = parseModelUsageSummary(modelRecord, modelName, defaultModelMeta);
    if (summary) {
      return [summary];
    }
  }

  return [fallback];
}

export const DEFAULT_CODEX_USAGE_ENDPOINTS = [
  "/backend-api/codex/usage",
  "/backend-api/wham/usage",
] as const;
export const DEFAULT_CODEX_USAGE_TIMEOUT_MS = 25_000;

const REFRESH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export function resolveAuthFilePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.length < 1) {
    return trimmed;
  }

  if (trimmed.startsWith("~/")) {
    const home = process.env.HOME;
    if (!home || home.trim().length < 1) {
      throw new Error("Cannot resolve `~` because HOME is not set");
    }

    return path.resolve(path.join(home, trimmed.slice(2)));
  }

  return path.resolve(trimmed);
}

function parseProxy(proxyUrl: string): ProxyInfo {
  const url = new URL(proxyUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported proxy protocol: ${url.protocol}`);
  }

  if (!url.hostname || !url.port) {
    throw new Error("Proxy URL must include host and port");
  }

  const port = Number.parseInt(url.port, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Invalid proxy port");
  }

  let authHeader: string | undefined;
  if (url.username || url.password) {
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  return {
    authHeader,
    host: url.hostname,
    port,
  };
}

function readAuthFile(authFilePath: string): {
  accessToken: string;
  refreshToken: string | null;
} {
  let parsed: AuthFileShape;

  try {
    parsed = JSON.parse(fs.readFileSync(authFilePath, "utf8")) as AuthFileShape;
  } catch (error) {
    throw new Error(`Failed to read auth file ${authFilePath}: ${(error as Error).message}`);
  }

  const accessToken = parsed.tokens?.access_token?.trim();
  const refreshToken = parsed.tokens?.refresh_token?.trim() ?? null;

  if (!accessToken) {
    throw new Error(`Auth file ${authFilePath} does not contain tokens.access_token`);
  }

  return {
    accessToken,
    refreshToken,
  };
}

function connectTunnel(
  proxy: ProxyInfo,
  targetHost: string,
  targetPort: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host);
    socket.setTimeout(timeoutMs);

    const cleanup = (): void => {
      socket.removeAllListeners("connect");
      socket.removeAllListeners("data");
      socket.removeAllListeners("timeout");
      socket.removeAllListeners("error");
    };

    socket.once("connect", () => {
      const lines = [
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
        `Host: ${targetHost}:${targetPort}`,
      ];

      if (proxy.authHeader) {
        lines.push(`Proxy-Authorization: ${proxy.authHeader}`);
      }

      lines.push("Connection: keep-alive", "", "");
      socket.write(lines.join("\r\n"));
    });

    let headerBuffer = Buffer.alloc(0);

    socket.on("data", (chunk: Buffer) => {
      headerBuffer = Buffer.concat([headerBuffer, chunk]);
      const markerIndex = headerBuffer.indexOf("\r\n\r\n");
      if (markerIndex < 0) {
        return;
      }

      const headerText = headerBuffer.slice(0, markerIndex).toString("utf8");
      const statusLine = headerText.split("\r\n", 1)[0] ?? "";
      const statusCodeMatch = statusLine.match(/\s(\d{3})\s/);
      const statusCode = statusCodeMatch
        ? Number.parseInt(statusCodeMatch[1], 10)
        : Number.NaN;

      if (!Number.isFinite(statusCode) || statusCode !== 200) {
        cleanup();
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed: ${statusLine || "unknown response"}`));
        return;
      }

      cleanup();
      resolve(socket);
    });

    socket.on("timeout", () => {
      cleanup();
      socket.destroy();
      reject(new Error("Proxy CONNECT timeout"));
    });

    socket.on("error", (error: Error) => {
      cleanup();
      socket.destroy();
      reject(error);
    });
  });
}

function decodeChunkedBody(buffer: Buffer): Buffer {
  let offset = 0;
  const chunks: Buffer[] = [];

  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf("\r\n", offset);
    if (lineEnd < 0) {
      throw new Error("Invalid chunked body: chunk size line is incomplete");
    }

    const sizeLine = buffer
      .slice(offset, lineEnd)
      .toString("ascii")
      .split(";", 1)[0]
      ?.trim();
    const chunkSize = Number.parseInt(sizeLine ?? "", 16);

    if (!Number.isFinite(chunkSize) || chunkSize < 0) {
      throw new Error("Invalid chunked body: invalid chunk size");
    }

    offset = lineEnd + 2;

    if (chunkSize === 0) {
      break;
    }

    const chunkEnd = offset + chunkSize;
    if (chunkEnd > buffer.length) {
      throw new Error("Invalid chunked body: chunk exceeds body length");
    }

    chunks.push(buffer.slice(offset, chunkEnd));
    offset = chunkEnd + 2;
  }

  return Buffer.concat(chunks);
}

function decodeResponseBody(
  body: Buffer,
  headers: Record<string, string>,
): Buffer {
  let result = body;

  const transferEncoding = (headers["transfer-encoding"] ?? "").toLowerCase();
  if (transferEncoding.includes("chunked")) {
    result = decodeChunkedBody(result);
  }

  const contentEncoding = (headers["content-encoding"] ?? "").toLowerCase();
  if (contentEncoding.includes("gzip")) {
    return zlib.gunzipSync(result);
  }

  if (contentEncoding.includes("deflate")) {
    return zlib.inflateSync(result);
  }

  if (contentEncoding.includes("br")) {
    return zlib.brotliDecompressSync(result);
  }

  return result;
}

function parseHttpResponse(raw: Buffer): {
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
} {
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    throw new Error("Invalid HTTP response: missing header separator");
  }

  const headerText = raw.slice(0, headerEnd).toString("utf8");
  const headerLines = headerText.split("\r\n");
  const statusLine = headerLines.shift() ?? "";
  const statusMatch = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})\b/);

  if (!statusMatch) {
    throw new Error(`Invalid HTTP status line: ${statusLine}`);
  }

  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers[key] = value;
  }

  const bodyRaw = raw.slice(headerEnd + 4);
  const body = decodeResponseBody(bodyRaw, headers);
  const bodyText = body.toString("utf8");

  return {
    bodyText,
    headers,
    statusCode: Number.parseInt(statusMatch[1], 10),
  };
}

async function requestJsonViaProxy<T>(options: {
  proxy: ProxyInfo;
  host: string;
  path: string;
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
}): Promise<HttpJsonResponse<T>> {
  const tunnel = await connectTunnel(
    options.proxy,
    options.host,
    443,
    options.timeoutMs,
  );

  return new Promise<HttpJsonResponse<T>>((resolve, reject) => {
    const secureSocket = tls.connect({
      ALPNProtocols: ["http/1.1"],
      rejectUnauthorized: true,
      servername: options.host,
      socket: tunnel,
    });

    secureSocket.setTimeout(options.timeoutMs);

    const rejectWith = (message: string): void => {
      secureSocket.destroy();
      reject(new Error(message));
    };

    secureSocket.once("secureConnect", () => {
      const body = options.body ?? "";
      const defaultHeaders: Record<string, string> = {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "close",
        Host: options.host,
        Origin: "https://chatgpt.com",
        Referer: "https://chatgpt.com/codex",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      };

      const headers = {
        ...defaultHeaders,
        ...(options.headers ?? {}),
      };

      if (body.length > 0) {
        headers["Content-Length"] = Buffer.byteLength(body).toString();
      }

      const lines = [
        `${options.method} ${options.path} HTTP/1.1`,
        ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
        "",
        body,
      ];

      secureSocket.write(lines.join("\r\n"));
    });

    const chunks: Buffer[] = [];
    secureSocket.on("data", (chunk: Buffer) => chunks.push(chunk));
    secureSocket.on("timeout", () =>
      rejectWith(`Request timeout for ${options.host}${options.path}`),
    );
    secureSocket.on("error", (error: Error) => reject(error));

    secureSocket.on("end", () => {
      try {
        const parsed = parseHttpResponse(Buffer.concat(chunks));
        const body = parsed.bodyText.trim();

        let json: T;
        try {
          json = JSON.parse(body) as T;
        } catch (error) {
          const preview = body.slice(0, 200).replace(/\s+/g, " ");
          throw new Error(
            `Expected JSON but got: ${preview || "<empty>"} (${(error as Error).message})`,
          );
        }

        resolve({
          headers: parsed.headers,
          json,
          statusCode: parsed.statusCode,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function requestJsonDirect<T>(options: {
  host: string;
  path: string;
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
}): Promise<HttpJsonResponse<T>> {
  const body = options.body ?? "";
  const defaultHeaders: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://chatgpt.com",
    Referer: "https://chatgpt.com/codex",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  const headers: Record<string, string> = {
    ...defaultHeaders,
    ...(options.headers ?? {}),
  };

  if (body.length > 0) {
    headers["Content-Length"] = Buffer.byteLength(body).toString();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`https://${options.host}${options.path}`, {
      body: body.length > 0 ? body : undefined,
      headers,
      method: options.method,
      signal: controller.signal,
    });
    const responseText = (await response.text()).trim();
    let json: T;

    try {
      json = JSON.parse(responseText) as T;
    } catch (error) {
      const preview = responseText.slice(0, 200).replace(/\s+/g, " ");
      throw new Error(
        `Expected JSON but got: ${preview || "<empty>"} (${(error as Error).message})`,
      );
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    return {
      headers: responseHeaders,
      json,
      statusCode: response.status,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout for ${options.host}${options.path}`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestJson<T>(options: {
  proxy?: ProxyInfo;
  host: string;
  path: string;
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
}): Promise<HttpJsonResponse<T>> {
  if (options.proxy) {
    return requestJsonViaProxy(options as {
      proxy: ProxyInfo;
      host: string;
      path: string;
      method: "GET" | "POST";
      body?: string;
      headers?: Record<string, string>;
      timeoutMs: number;
    });
  }

  return requestJsonDirect({
    body: options.body,
    headers: options.headers,
    host: options.host,
    method: options.method,
    path: options.path,
    timeoutMs: options.timeoutMs,
  });
}

async function fetchUsage(
  accessToken: string,
  proxy: ProxyInfo | undefined,
  endpoint: string,
  timeoutMs: number,
): Promise<HttpJsonResponse<CodexUsagePayload>> {
  return requestJson<CodexUsagePayload>({
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    host: "chatgpt.com",
    method: "GET",
    path: endpoint,
    proxy,
    timeoutMs,
  });
}

async function fetchUsageWithFallback(
  accessToken: string,
  proxy: ProxyInfo | undefined,
  timeoutMs: number,
  endpoints: readonly string[],
): Promise<{ endpoint: string; response: HttpJsonResponse<CodexUsagePayload> }> {
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchUsage(accessToken, proxy, endpoint, timeoutMs);
      return { endpoint, response };
    } catch (error) {
      errors.push(`${endpoint}: ${(error as Error).message}`);
    }
  }

  throw new Error(`All usage endpoints failed. ${errors.join(" | ")}`);
}

async function refreshAccessToken(
  refreshToken: string,
  proxy: ProxyInfo | undefined,
  timeoutMs: number,
): Promise<string> {
  const payload = {
    client_id: REFRESH_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "openid profile email",
  };

  const response = await requestJson<{ access_token?: string }>({
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    host: "auth.openai.com",
    method: "POST",
    path: "/oauth/token",
    proxy,
    timeoutMs,
  });

  if (response.statusCode >= 400) {
    throw new Error(`Token refresh failed with status ${response.statusCode}`);
  }

  const nextAccessToken = response.json.access_token?.trim();
  if (!nextAccessToken) {
    throw new Error("Refresh response does not include access_token");
  }

  return nextAccessToken;
}

export function formatUsageReset(unixSeconds: number | undefined): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) {
    return "n/a";
  }

  return new Date(unixSeconds * 1000).toISOString();
}

export function formatUsageWindow(
  label: string,
  window: CodexUsageWindow,
): string {
  if (!window) {
    return `${label}: n/a`;
  }

  const usedPercent = window.used_percent ?? 0;
  const resetAt = formatUsageReset(window.reset_at);
  return `${label}: ${usedPercent}% (reset ${resetAt})`;
}

export function shortenUsageAccountId(value: string | undefined): string {
  if (!value) {
    return "n/a";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function fetchCodexUsageForAuthFile(
  input: FetchCodexUsageInput,
): Promise<FetchCodexUsageResult> {
  const absoluteAuthFilePath = resolveAuthFilePath(input.authFilePath);
  const timeoutMs = input.timeoutMs ?? DEFAULT_CODEX_USAGE_TIMEOUT_MS;
  const proxy =
    typeof input.proxyUrl === "string" && input.proxyUrl.trim().length > 0
      ? parseProxy(input.proxyUrl.trim())
      : undefined;
  const { accessToken, refreshToken } = readAuthFile(absoluteAuthFilePath);
  const endpoints = input.endpoint
    ? [input.endpoint]
    : [...DEFAULT_CODEX_USAGE_ENDPOINTS];

  let tokenToUse = accessToken;
  let refreshedToken = false;

  let usageResult = await fetchUsageWithFallback(
    tokenToUse,
    proxy,
    timeoutMs,
    endpoints,
  );
  let usageResponse = usageResult.response;

  if (usageResponse.statusCode === 401 && refreshToken) {
    tokenToUse = await refreshAccessToken(refreshToken, proxy, timeoutMs);
    refreshedToken = true;
    usageResult = await fetchUsageWithFallback(
      tokenToUse,
      proxy,
      timeoutMs,
      endpoints,
    );
    usageResponse = usageResult.response;
  }

  if (usageResponse.statusCode >= 400) {
    throw new Error(`Usage request failed with status ${usageResponse.statusCode}`);
  }

  return {
    absoluteAuthFilePath,
    endpoint: usageResult.endpoint,
    refreshedToken,
    usage: usageResponse.json,
  };
}
