export interface PathValidationResult {
  exists: boolean;
  isDirectory: boolean;
}

export interface SettingValidationOptions {
  validatePath: (path: string) => Promise<PathValidationResult>;
}

const TEMPLATE_REQUIRED_TOKENS: Record<string, string[]> = {
  codex_command_template: ["{{contextPath}}", "{{model}}", "{{reasoning}}", "{{message}}"],
  task_message_template: ["{{context}}", "{{task}}"],
  task_message_template_with_history: ["{{history}}", "{{context}}", "{{task}}"],
};

function assertTemplateContainsRequiredTokens(key: string, value: string): void {
  const requiredTokens = TEMPLATE_REQUIRED_TOKENS[key];
  if (!requiredTokens) {
    return;
  }

  for (const token of requiredTokens) {
    if (!value.includes(token)) {
      throw new Error(`Setting \`${key}\` must include template token ${token}`);
    }
  }
}

export async function validateSettingValue(
  key: string,
  value: string,
  options: SettingValidationOptions,
): Promise<void> {
  const normalizedValue = value.trim();

  if (key !== "codex_usage_proxy_url" && normalizedValue.length < 1) {
    throw new Error(`Setting \`${key}\` requires a non-empty value`);
  }

  if (key === "daemon_max_parallel_tasks") {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric < 1) {
      throw new Error("daemon_max_parallel_tasks must be a positive integer");
    }
  }

  if (key === "project_path_sort_mode") {
    if (value !== "modified" && value !== "name") {
      throw new Error("project_path_sort_mode must be either `modified` or `name`");
    }
  }

  if (key === "codex_usage_proxy_enabled") {
    if (normalizedValue !== "true" && normalizedValue !== "false") {
      throw new Error("codex_usage_proxy_enabled must be either `true` or `false`");
    }
  }

  if (key === "default_project_base_path") {
    const pathValidation = await options.validatePath(value);
    if (!pathValidation.exists || !pathValidation.isDirectory) {
      throw new Error("default_project_base_path must point to an existing directory");
    }
  }

  assertTemplateContainsRequiredTokens(key, value);
}
