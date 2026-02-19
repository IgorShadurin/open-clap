import type { SettingMap } from "./settings";

export const DEFAULT_SETTINGS: SettingMap = {
  codex_command_template:
    'codex run --cwd "{{contextPath}}" --model "{{model}}" --reasoning "{{reasoning}}" "{{message}}"',
  task_message_template: "Context:\n{{context}}\n\nTask:\n{{task}}",
  task_message_template_with_history:
    "History:\n{{history}}\n\nContext:\n{{context}}\n\nTask:\n{{task}}",
  daemon_max_parallel_tasks: "2",
  default_project_base_path: ".",
  project_path_sort_mode: "modified",
};

export function getDefaultSettings(): SettingMap {
  return { ...DEFAULT_SETTINGS };
}
