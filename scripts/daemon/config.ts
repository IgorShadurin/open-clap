import {
  resolveSettings,
  type SettingMap,
  SETTINGS_ENV_PREFIX,
  type EnvMap,
} from "../../src/lib/settings";
import { getDefaultSettings } from "../../src/lib/settings-defaults";

export interface DaemonConfig {
  codexCommandTemplateWarnings: string[];
  codexCommandTemplate: string;
  maxParallelTasks: number;
  pollIntervalMs: number;
  taskTemplate: string;
  taskTemplateWithHistory: string;
}

export interface LoadDaemonConfigOptions {
  settings?: SettingMap;
  env?: EnvMap;
}

const FALLBACK_MAX_PARALLEL_TASKS = 2;
const DEFAULT_POLL_INTERVAL_MS = 1000;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function normalizeCodexCommandTemplate(
  template: string,
): { template: string; warnings: string[] } {
  let normalized = template;
  const warnings: string[] = [];
  const hadReasoningPlaceholder = normalized.includes("{{reasoning}}");

  if (/\bcodex\s+run\b/.test(normalized)) {
    normalized = normalized.replace(/\bcodex\s+run\b/g, "codex exec");
    warnings.push("Replaced unsupported `codex run` with `codex exec`.");
  }

  if (/--cwd\b/.test(normalized)) {
    normalized = normalized.replace(/--cwd\b/g, "--cd");
    warnings.push("Replaced unsupported `--cwd` with `--cd`.");
  }

  const reasoningFlagRegex = /\s+--reasoning\s+("|')?\{\{reasoning\}\}\1?/g;
  const hasLegacyReasoningFlag = reasoningFlagRegex.test(normalized);
  if (hasLegacyReasoningFlag) {
    normalized = normalized.replace(reasoningFlagRegex, "");
  }

  const messageReasoningRegex =
    /(\{\{message\}\})(?:(?:\\n|\\r\\n|\n|\r){2})Reasoning:\s*\{\{reasoning\}\}/g;
  if (messageReasoningRegex.test(normalized)) {
    normalized = normalized.replace(messageReasoningRegex, "$1");
  }

  const hasReasoningConfig =
    /-c\s+model_reasoning_effort\s*=\s*("|')?\{\{reasoning\}\}\1?/.test(normalized);
  if (hadReasoningPlaceholder && !hasReasoningConfig) {
    normalized = `${normalized} -c model_reasoning_effort="{{reasoning}}"`;
  }

  return { template: normalized, warnings };
}

export function loadDaemonConfig(
  options: LoadDaemonConfigOptions = {},
): DaemonConfig {
  const defaults = getDefaultSettings();
  const resolved = resolveSettings({
    defaults,
    dbSettings: options.settings ?? {},
    env: options.env ?? process.env,
    envPrefix: SETTINGS_ENV_PREFIX,
  });
  const normalizedCommandTemplate = normalizeCodexCommandTemplate(
    resolved.codex_command_template.value,
  );

  return {
    codexCommandTemplate: normalizedCommandTemplate.template,
    codexCommandTemplateWarnings: normalizedCommandTemplate.warnings,
    taskTemplate: resolved.task_message_template.value,
    taskTemplateWithHistory: resolved.task_message_template_with_history.value,
    maxParallelTasks: parsePositiveInteger(
      resolved.daemon_max_parallel_tasks.value,
      FALLBACK_MAX_PARALLEL_TASKS,
    ),
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };
}
