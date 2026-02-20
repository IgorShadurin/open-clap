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

  if (/\bcodex\s+run\b/.test(normalized)) {
    normalized = normalized.replace(/\bcodex\s+run\b/g, "codex exec");
    warnings.push("Replaced unsupported `codex run` with `codex exec`.");
  }

  if (/--cwd\b/.test(normalized)) {
    normalized = normalized.replace(/--cwd\b/g, "--cd");
    warnings.push("Replaced unsupported `--cwd` with `--cd`.");
  }

  const reasoningFlagRegex =
    /\s+--reasoning\s+("|')?\{\{reasoning\}\}\1?/g;
  if (reasoningFlagRegex.test(normalized)) {
    normalized = normalized.replace(reasoningFlagRegex, "");
    if (!normalized.includes("{{reasoning}}")) {
      normalized = normalized.replace(
        "{{message}}",
        "{{message}}\\n\\nReasoning: {{reasoning}}",
      );
    }
    warnings.push(
      "Removed unsupported `--reasoning` flag and injected reasoning into message payload.",
    );
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
