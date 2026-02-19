import { config as loadDotenvConfig } from "dotenv";

export const SETTINGS_ENV_PREFIX = "SETTINGS_";

export type SettingMap = Record<string, string>;
export type SettingSource = "default" | "env" | "db";
export type EnvMap = Record<string, string | undefined>;

export interface EffectiveSetting {
  key: string;
  source: SettingSource;
  value: string;
}

export interface ResolveSettingsOptions {
  dbSettings: SettingMap;
  defaults: SettingMap;
  env?: EnvMap;
  envPrefix?: string;
}

export function initializeDotenv(): void {
  loadDotenvConfig();
}

export function normalizeSettingKey(key: string): string {
  return key.trim().toLowerCase();
}

export function parseSettingsFromEnv(
  env: EnvMap,
  prefix = SETTINGS_ENV_PREFIX,
): SettingMap {
  const parsed: SettingMap = {};

  for (const [rawKey, rawValue] of Object.entries(env)) {
    if (!rawKey.startsWith(prefix)) {
      continue;
    }

    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      continue;
    }

    const settingKey = normalizeSettingKey(rawKey.slice(prefix.length));
    if (!settingKey) {
      continue;
    }

    parsed[settingKey] = rawValue;
  }

  return parsed;
}

export function resolveSetting(
  key: string,
  defaults: SettingMap,
  envSettings: SettingMap,
  dbSettings: SettingMap,
): EffectiveSetting | null {
  const normalizedKey = normalizeSettingKey(key);
  if (!normalizedKey) {
    return null;
  }

  if (Object.hasOwn(dbSettings, normalizedKey)) {
    return {
      key: normalizedKey,
      source: "db",
      value: dbSettings[normalizedKey],
    };
  }

  if (Object.hasOwn(envSettings, normalizedKey)) {
    return {
      key: normalizedKey,
      source: "env",
      value: envSettings[normalizedKey],
    };
  }

  if (Object.hasOwn(defaults, normalizedKey)) {
    return {
      key: normalizedKey,
      source: "default",
      value: defaults[normalizedKey],
    };
  }

  return null;
}

export function resolveSettings({
  dbSettings,
  defaults,
  env = process.env,
  envPrefix = SETTINGS_ENV_PREFIX,
}: ResolveSettingsOptions): Record<string, EffectiveSetting> {
  const envSettings = parseSettingsFromEnv(env, envPrefix);
  const keys = new Set([
    ...Object.keys(defaults),
    ...Object.keys(envSettings),
    ...Object.keys(dbSettings),
  ]);

  const effective: Record<string, EffectiveSetting> = {};

  for (const key of keys) {
    const resolved = resolveSetting(key, defaults, envSettings, dbSettings);
    if (resolved) {
      effective[key] = resolved;
    }
  }

  return effective;
}
