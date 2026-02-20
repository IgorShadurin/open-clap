import { createHash } from "node:crypto";

import type { DaemonRuntimeSettings } from "../../shared/contracts";
import type { EnvMap } from "./settings";
import { getDefaultSettings } from "./settings-defaults";
import { getSettingsRecords } from "./settings-store";

const DAEMON_SETTING_KEYS = [
  "codex_command_template",
  "daemon_max_parallel_tasks",
  "task_message_template",
  "task_message_template_with_history",
] as const;

function buildRevision(settings: DaemonRuntimeSettings): string {
  return createHash("sha1")
    .update(JSON.stringify(settings))
    .digest("hex");
}

export async function getDaemonRuntimeSettingsSnapshot(
  env: EnvMap = process.env,
): Promise<{
  revision: string;
  settings: DaemonRuntimeSettings;
}> {
  const defaults = getDefaultSettings();
  const records = await getSettingsRecords(env);
  const byKey = Object.fromEntries(records.map((record) => [record.key, record.effectiveValue]));

  const settings: DaemonRuntimeSettings = {
    codex_command_template:
      byKey.codex_command_template ?? defaults.codex_command_template,
    daemon_max_parallel_tasks:
      byKey.daemon_max_parallel_tasks ?? defaults.daemon_max_parallel_tasks,
    task_message_template:
      byKey.task_message_template ?? defaults.task_message_template,
    task_message_template_with_history:
      byKey.task_message_template_with_history ??
      defaults.task_message_template_with_history,
  };

  for (const key of DAEMON_SETTING_KEYS) {
    if (typeof settings[key] !== "string" || settings[key].length < 1) {
      throw new Error(`Missing daemon runtime setting: ${key}`);
    }
  }

  return {
    revision: buildRevision(settings),
    settings,
  };
}
