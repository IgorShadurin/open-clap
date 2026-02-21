export const DEFAULT_TASK_MODEL = "gpt-5.3-codex";
export const DEFAULT_TASK_REASONING = "medium";

export const TASK_MODEL_OPTIONS = [
  { label: "gpt-5.3-codex-spark", value: "gpt-5.3-codex-spark" },
  { label: "gpt-5.3-codex", value: "gpt-5.3-codex" },
  { label: "gpt-5.2-codex", value: "gpt-5.2-codex" },
  { label: "gpt-5.1-codex-max", value: "gpt-5.1-codex-max" },
  { label: "gpt-5.2", value: "gpt-5.2" },
  { label: "gpt-5.1-codex-mini", value: "gpt-5.1-codex-mini" },
] as const;

export const TASK_REASONING_OPTIONS = [
  { label: "minimal", value: "minimal" },
  { label: "low", value: "low" },
  { label: "medium", value: "medium" },
  { label: "high", value: "high" },
  { label: "xhigh", value: "xhigh" },
] as const;
