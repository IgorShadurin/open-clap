import type { SettingMap } from "./settings";
import { loadPromptTemplate } from "./prompt-templates";

export const DEFAULT_SETTINGS: SettingMap = {
  codex_command_template: loadPromptTemplate("prompts/codex-command-template.md"),
  task_message_template: loadPromptTemplate("prompts/task-message-template.md"),
  task_message_template_with_history: loadPromptTemplate(
    "prompts/task-message-with-history-template.md",
  ),
  codex_usage_auth_file: "~/.codex/auth.json",
  codex_usage_proxy_enabled: "false",
  codex_usage_proxy_url: "",
  daemon_max_parallel_tasks: "2",
  default_project_base_path: ".",
  project_path_sort_mode: "modified",
};

export function getDefaultSettings(): SettingMap {
  return { ...DEFAULT_SETTINGS };
}
