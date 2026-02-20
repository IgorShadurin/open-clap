#!/usr/bin/env tsx
import path from "node:path";

import {
  DEFAULT_CODEX_USAGE_ENDPOINTS,
  DEFAULT_CODEX_USAGE_TIMEOUT_MS,
  fetchCodexUsageForAuthFile,
  formatUsageWindow,
  shortenUsageAccountId,
} from "../src/lib/codex-usage";

type CliOptions = {
  authFiles: string[];
  endpoint: string | null;
  proxy: string;
  timeoutMs: number;
};

function printHelp(): void {
  const text = [
    "Usage:",
    "  tsx scripts/codex-usage.ts --auth-file <path> [--auth-file <path>] --proxy <http://user:pass@host:port>",
    "",
    "Options:",
    "  --auth-file <path>   Path to Codex auth JSON file (repeatable)",
    "  --proxy <url>        HTTP proxy URL (required)",
    `  --endpoint <path>    Usage endpoint path (default fallback order: ${DEFAULT_CODEX_USAGE_ENDPOINTS.join(", ")})`,
    `  --timeout-ms <num>   Request timeout in ms (default: ${DEFAULT_CODEX_USAGE_TIMEOUT_MS})`,
    "  --help               Show this help",
    "",
    "Example:",
    "  tsx scripts/codex-usage.ts --auth-file ~/.codex/auth-primary.json --auth-file ~/.codex/auth-secondary.json --proxy http://user:pass@host:port",
  ].join("\n");

  console.log(text);
}

function expandHome(value: string): string {
  if (!value.startsWith("~/")) {
    return value;
  }

  const home = process.env.HOME;
  if (!home) {
    return value;
  }

  return path.join(home, value.slice(2));
}

function parseArgs(argv: string[]): CliOptions {
  const authFiles: string[] = [];
  let proxy = "";
  let endpoint: string | null = null;
  let timeoutMs = DEFAULT_CODEX_USAGE_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--auth-file") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --auth-file");
      }

      authFiles.push(expandHome(value));
      index += 1;
      continue;
    }

    if (arg === "--proxy") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --proxy");
      }

      proxy = value;
      index += 1;
      continue;
    }

    if (arg === "--endpoint") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --endpoint");
      }

      endpoint = value.startsWith("/") ? value : `/${value}`;
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --timeout-ms");
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--timeout-ms must be a positive integer");
      }

      timeoutMs = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!proxy) {
    throw new Error("--proxy is required");
  }

  if (authFiles.length < 1) {
    throw new Error("At least one --auth-file is required");
  }

  return {
    authFiles,
    endpoint,
    proxy,
    timeoutMs,
  };
}

async function runForAuthFile(filePath: string, options: CliOptions): Promise<void> {
  const result = await fetchCodexUsageForAuthFile({
    authFilePath: filePath,
    endpoint: options.endpoint,
    proxyUrl: options.proxy,
    timeoutMs: options.timeoutMs,
  });

  const rateLimit = result.usage.rate_limit;

  console.log(`\n=== ${result.absoluteAuthFilePath} ===`);
  console.log(`Plan: ${result.usage.plan_type ?? "n/a"}`);
  console.log(`Account: ${shortenUsageAccountId(result.usage.account_id)}`);
  console.log(`Endpoint: ${result.endpoint}`);
  console.log(`Allowed: ${String(rateLimit?.allowed ?? false)}`);
  console.log(formatUsageWindow("5h", rateLimit?.primary_window ?? null));
  console.log(formatUsageWindow("Weekly", rateLimit?.secondary_window ?? null));

  if (result.refreshedToken) {
    console.log("Token refresh: used refresh_token because access_token was unauthorized");
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  for (const authFile of options.authFiles) {
    try {
      await runForAuthFile(authFile, options);
    } catch (error) {
      console.error(`\n=== ${path.resolve(authFile)} ===`);
      console.error(`Error: ${(error as Error).message}`);
    }
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
