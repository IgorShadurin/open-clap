import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatElapsedDuration,
  SPARK_TASK_TIMEOUTS_MS,
  STANDARD_TASK_TIMEOUTS_MS,
  formatTimeoutDuration,
  resolveTaskExecutionTimeoutMs,
} from "../../scripts/daemon/task-timeout-config";

test("resolveTaskExecutionTimeoutMs uses spark high timeout for high/xhigh", () => {
  assert.equal(
    resolveTaskExecutionTimeoutMs({
      model: "gpt-5.3-codex-spark",
      reasoning: "high",
    }),
    SPARK_TASK_TIMEOUTS_MS.highReasoning,
  );
  assert.equal(
    resolveTaskExecutionTimeoutMs({
      model: "gpt-5.3-codex-spark",
      reasoning: "xhigh",
    }),
    SPARK_TASK_TIMEOUTS_MS.highReasoning,
  );
});

test("resolveTaskExecutionTimeoutMs uses spark lower timeout for minimal/low/medium", () => {
  assert.equal(
    resolveTaskExecutionTimeoutMs({
      model: "gpt-5.3-codex-spark",
      reasoning: "minimal",
    }),
    SPARK_TASK_TIMEOUTS_MS.lowerReasoning,
  );
  assert.equal(
    resolveTaskExecutionTimeoutMs({
      model: "gpt-5.3-codex-spark",
      reasoning: "medium",
    }),
    SPARK_TASK_TIMEOUTS_MS.lowerReasoning,
  );
});

test("resolveTaskExecutionTimeoutMs uses standard model timeout policy", () => {
  assert.equal(
    resolveTaskExecutionTimeoutMs({
      model: "gpt-5.3-codex",
      reasoning: "xhigh",
    }),
    STANDARD_TASK_TIMEOUTS_MS.highReasoning,
  );
  assert.equal(
    resolveTaskExecutionTimeoutMs({
      model: "gpt-5.3-codex",
      reasoning: "low",
    }),
    STANDARD_TASK_TIMEOUTS_MS.lowerReasoning,
  );
});

test("resolveTaskExecutionTimeoutMs is case-insensitive for model and reasoning", () => {
  assert.equal(
    resolveTaskExecutionTimeoutMs({
      model: "GPT-5.3-CODEX-SPARK",
      reasoning: "XHIGH",
    }),
    SPARK_TASK_TIMEOUTS_MS.highReasoning,
  );
});

test("formatTimeoutDuration renders human-readable duration labels", () => {
  assert.equal(formatTimeoutDuration(600_000), "10m");
  assert.equal(formatTimeoutDuration(15_000), "15s");
  assert.equal(formatTimeoutDuration(25), "25ms");
});

test("formatElapsedDuration renders runtime durations in a compact human form", () => {
  assert.equal(formatElapsedDuration(950), "950ms");
  assert.equal(formatElapsedDuration(1_200), "1.2s");
  assert.equal(formatElapsedDuration(45_500), "46s");
  assert.equal(formatElapsedDuration(70_000), "1m 10s");
  assert.equal(formatElapsedDuration(3_700_000), "1h 1m 40s");
});
