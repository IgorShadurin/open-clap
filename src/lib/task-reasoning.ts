export const DEFAULT_TASK_MODEL = "gpt-5.3-codex";
export const DEFAULT_TASK_REASONING = "medium";

export const TASK_MODEL_OPTIONS = [
  { label: "gpt-5.3-codex", value: "gpt-5.3-codex" },
  { label: "gpt-5.2-codex", value: "gpt-5.2-codex" },
  { label: "gpt-5.1-codex-max", value: "gpt-5.1-codex-max" },
  { label: "gpt-5.2", value: "gpt-5.2" },
  { label: "gpt-5.1-codex-mini", value: "gpt-5.1-codex-mini" },
] as const;

export const TASK_REASONING_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium (default)", value: "medium" },
  { label: "High", value: "high" },
  { label: "Extra high", value: "extra high" },
] as const;
