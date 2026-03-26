import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CODEX_MODEL,
  SPARK_CODEX_MODEL,
  isSparkCodexModel,
  normalizeCodexUsageModelName,
  toCanonicalCodexModelId,
} from "../../../shared/logic/codex-models";

test("toCanonicalCodexModelId normalizes aliases and casing", () => {
  assert.equal(toCanonicalCodexModelId(" default "), DEFAULT_CODEX_MODEL);
  assert.equal(toCanonicalCodexModelId("codex_bengalfox"), SPARK_CODEX_MODEL);
  assert.equal(toCanonicalCodexModelId(" GPT-5.3-CODEX "), DEFAULT_CODEX_MODEL);
});

test("normalizeCodexUsageModelName reuses canonical model ids", () => {
  assert.equal(normalizeCodexUsageModelName("codex-bengalfox"), SPARK_CODEX_MODEL);
});

test("isSparkCodexModel detects spark variants after normalization", () => {
  assert.equal(isSparkCodexModel("codex_bengalfox"), true);
  assert.equal(isSparkCodexModel(DEFAULT_CODEX_MODEL), false);
});
