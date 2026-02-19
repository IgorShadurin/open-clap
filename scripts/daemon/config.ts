import {
  resolveSettings,
  type SettingMap,
  SETTINGS_ENV_PREFIX,
  type EnvMap,
} from "../../src/lib/settings";
import { getDefaultSettings } from "../../src/lib/settings-defaults";

export interface DaemonConfig {
  codexCommandTemplate: string;
  maxParallelTasks: number;
  pollIntervalMs: number;
  taskTemplate: string;
  taskTemplateWithHistory: string;
}

export interface LoadDaemonConfigOptions {
  dbSettings?: SettingMap;
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

export function loadDaemonConfig(
  options: LoadDaemonConfigOptions = {},
): DaemonConfig {
  const defaults = getDefaultSettings();
  const resolved = resolveSettings({
    defaults,
    dbSettings: options.dbSettings ?? {},
    env: options.env ?? process.env,
    envPrefix: SETTINGS_ENV_PREFIX,
  });

  return {
    codexCommandTemplate: resolved.codex_command_template.value,
    taskTemplate: resolved.task_message_template.value,
    taskTemplateWithHistory: resolved.task_message_template_with_history.value,
    maxParallelTasks: parsePositiveInteger(
      resolved.daemon_max_parallel_tasks.value,
      FALLBACK_MAX_PARALLEL_TASKS,
    ),
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };
}
