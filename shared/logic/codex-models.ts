export const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";
export const SPARK_CODEX_MODEL = "gpt-5.3-codex-spark";

const MODEL_CANONICAL_ALIASES: Readonly<Record<string, string>> = {
  "codex-bengalfox": SPARK_CODEX_MODEL,
  default: DEFAULT_CODEX_MODEL,
};

export function toCanonicalCodexModelId(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const canonical = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  if (!canonical) {
    return "";
  }

  return MODEL_CANONICAL_ALIASES[canonical] ?? canonical;
}

export function normalizeCodexUsageModelName(value: string | null | undefined): string {
  return toCanonicalCodexModelId(value);
}

export function isSparkCodexModel(value: string | null | undefined): boolean {
  return toCanonicalCodexModelId(value).includes("spark");
}
