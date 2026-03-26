import { DEFAULT_CODEX_MODEL, SPARK_CODEX_MODEL } from "../../shared/logic/codex-models";

export const DEFAULT_TASK_MODEL = DEFAULT_CODEX_MODEL;
export const DEFAULT_TASK_REASONING = "medium";

export const TASK_MODEL_OPTIONS = [
  { label: "gpt-5.4", value: "gpt-5.4" },
  { label: DEFAULT_CODEX_MODEL, value: DEFAULT_CODEX_MODEL },
  { label: "gpt-5.2-codex", value: "gpt-5.2-codex" },
  { label: "gpt-5.1-codex-max", value: "gpt-5.1-codex-max" },
  { label: "gpt-5.2", value: "gpt-5.2" },
  { label: "gpt-5.1-codex-mini", value: "gpt-5.1-codex-mini" },
  { label: SPARK_CODEX_MODEL, value: SPARK_CODEX_MODEL },
] as const;

export const TASK_REASONING_OPTIONS = [
  { label: "minimal", value: "minimal" },
  { label: "low", value: "low" },
  { label: "medium", value: "medium" },
  { label: "high", value: "high" },
  { label: "xhigh", value: "xhigh" },
] as const;

export type TaskModelOption = (typeof TASK_MODEL_OPTIONS)[number];
export type TaskReasoningOption = (typeof TASK_REASONING_OPTIONS)[number];

const TASK_MODEL_EMOJIS: Readonly<Record<TaskModelOption["value"], string>> = {
  "gpt-5.4": "🆕",
  [SPARK_CODEX_MODEL]: "✨",
  [DEFAULT_CODEX_MODEL]: "🚀",
  "gpt-5.2-codex": "🧠",
  "gpt-5.1-codex-max": "🏎️",
  "gpt-5.2": "🧰",
  "gpt-5.1-codex-mini": "🧩",
} as const;

const TASK_REASONING_EMOJIS: Readonly<Record<TaskReasoningOption["value"], string>> = {
  minimal: "🧾",
  low: "🐢",
  medium: "⚙️",
  high: "🔥",
  xhigh: "🤯",
} as const;

export const TASK_MODEL_OPTIONS_WITH_EMOJI = TASK_MODEL_OPTIONS.map((option) => ({
  ...option,
  displayLabel: `${TASK_MODEL_EMOJIS[option.value]} ${option.label}`,
})) as ReadonlyArray<
  Readonly<{ value: string; label: string; displayLabel: string }>
>;

export const TASK_REASONING_OPTIONS_WITH_EMOJI = TASK_REASONING_OPTIONS.map((option) => ({
  ...option,
  displayLabel: `${TASK_REASONING_EMOJIS[option.value]} ${option.label}`,
})) as ReadonlyArray<
  Readonly<{ value: string; label: string; displayLabel: string }>
>;

export function getTaskModelDisplayLabel(value: string): string {
  const option = TASK_MODEL_OPTIONS_WITH_EMOJI.find((item) => item.value === value);
  if (option) {
    return option.displayLabel;
  }

  return value;
}

export function getTaskReasoningDisplayLabel(value: string): string {
  const option = TASK_REASONING_OPTIONS_WITH_EMOJI.find((item) => item.value === value);
  if (option) {
    return option.displayLabel;
  }

  return value;
}
