import type { SettingRecord } from "../../shared/contracts";
import type { EnvMap, SettingMap } from "./settings";
import { validatePathExists } from "./path-validation";
import { parseSettingsFromEnv, resolveSettings } from "./settings";
import { getDefaultSettings } from "./settings-defaults";
import { validateSettingValue } from "./settings-validation";
import { prisma } from "./prisma";

const EDITABLE_KEYS = new Set([
  "codex_command_template",
  "daemon_max_parallel_tasks",
  "codex_usage_auth_file",
  "codex_usage_proxy_enabled",
  "codex_usage_proxy_url",
  "default_project_base_path",
  "project_path_sort_mode",
  "task_message_template",
  "task_message_template_with_history",
]);

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function toDbMap(
  rows: Array<{
    key: string;
    value: string;
  }>,
): SettingMap {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getSettingsRecords(
  env: EnvMap = process.env,
): Promise<SettingRecord[]> {
  const defaults = getDefaultSettings();
  const envSettings = parseSettingsFromEnv(env);
  const dbRows = await prisma.setting.findMany({
    orderBy: [{ key: "asc" }],
    select: {
      key: true,
      value: true,
    },
  });
  const dbSettings = toDbMap(dbRows);
  const resolved = resolveSettings({
    dbSettings,
    defaults,
    env,
  });

  return Object.keys(resolved)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({
      dbValue: Object.hasOwn(dbSettings, key) ? dbSettings[key] : null,
      defaultValue: Object.hasOwn(defaults, key) ? defaults[key] : null,
      effectiveValue: resolved[key].value,
      envValue: Object.hasOwn(envSettings, key) ? envSettings[key] : null,
      key,
      source: resolved[key].source,
    }));
}

export async function getSettingValue(
  key: string,
  env: EnvMap = process.env,
): Promise<string> {
  const normalizedKey = normalizeKey(key);
  const settings = await getSettingsRecords(env);
  const found = settings.find((setting) => setting.key === normalizedKey);
  if (found) {
    return found.effectiveValue;
  }

  throw new Error(`Unknown setting key: ${normalizedKey}`);
}

export async function upsertSetting(
  key: string,
  value: string,
): Promise<SettingRecord> {
  const normalizedKey = normalizeKey(key);
  if (!EDITABLE_KEYS.has(normalizedKey)) {
    throw new Error(`Setting \`${normalizedKey}\` is not editable`);
  }

  await validateSettingValue(normalizedKey, value, {
    validatePath: validatePathExists,
  });

  await prisma.setting.upsert({
    create: {
      key: normalizedKey,
      value,
    },
    update: {
      value,
    },
    where: {
      key: normalizedKey,
    },
  });

  const settings = await getSettingsRecords();
  const updated = settings.find((item) => item.key === normalizedKey);
  if (!updated) {
    throw new Error(`Failed to resolve updated setting \`${normalizedKey}\``);
  }

  return updated;
}
