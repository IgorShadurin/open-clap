import assert from "node:assert/strict";
import test from "node:test";

import type { CodexUsagePayload } from "../../src/lib/codex-usage";
import { extractCodexUsageModelSummaries } from "../../src/lib/codex-usage";

test("extracts legacy usage payload into a single model summary", () => {
  const payload: CodexUsagePayload = {
    account_id: "acc-legacy",
    plan_type: "legacy-plan",
    rate_limit: {
      allowed: true,
      primary_window: {
        used_percent: 22,
        reset_at: 1_700_000_000,
      },
      secondary_window: {
        used_percent: 17,
        reset_at: 1_700_003_600,
      },
    },
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.model, "default");
  assert.equal(summaries[0]?.fiveHourUsedPercent, 22);
  assert.equal(summaries[0]?.fiveHourResetAt, new Date(1_700_000_000 * 1000).toISOString());
  assert.equal(summaries[0]?.weeklyUsedPercent, 17);
  assert.equal(summaries[0]?.weeklyResetAt, new Date(1_700_003_600 * 1000).toISOString());
  assert.equal(summaries[0]?.planType, "legacy-plan");
});

test("extracts multiple model summaries when models list is present", () => {
  const payload: CodexUsagePayload = {
    account_id: "acc-multi",
    plan_type: "new-plan",
    rate_limit: {
      models: [
        {
          model: "gpt-5.3-codex",
          primary_window: {
            used_percent: 98,
            reset_at: 1_700_100_000,
          },
          secondary_window: {
            used_percent: 89,
            reset_at: 1_700_200_000,
          },
        },
        {
          model: "gpt-5.3-codex-spark",
          primary_window: {
            used_percent: 99,
            reset_at: 1_700_300_000,
          },
          secondary_window: {
            used_percent: 88,
            reset_at: 1_700_400_000,
          },
        },
      ],
    },
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.model, "gpt-5.3-codex");
  assert.equal(summaries[1]?.model, "gpt-5.3-codex-spark");
  assert.equal(summaries[0]?.fiveHourUsedPercent, 98);
  assert.equal(summaries[1]?.fiveHourUsedPercent, 99);
  assert.equal(summaries[1]?.weeklyUsedPercent, 88);
});

test("extracts model summary from custom object model map on rate limit", () => {
  const payload: CodexUsagePayload = {
    plan_type: "mapped-plan",
    rate_limit: {
      models: {
        "gpt-5.3-codex-spark": {
          primary_window: {
            used_percent: 12,
            reset_at: 1_701_000_000,
          },
          secondary_window: {
            used_percent: 9,
            reset_at: 1_701_100_000,
          },
        },
      },
    },
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.model, "gpt-5.3-codex-spark");
});

test("extracts additional rate limits into model summaries", () => {
  const payload: CodexUsagePayload = {
    plan_type: "new-plan",
    rate_limit: {
      allowed: true,
      primary_window: {
        used_percent: 90,
        reset_at: 1_700_000_100,
      },
      secondary_window: {
        used_percent: 80,
        reset_at: 1_700_000_200,
      },
    },
    additional_rate_limits: [
      {
        limit_name: "GPT-5.3-Codex-Spark limit",
        metered_feature: "gpt-5.3-codex-spark",
        rate_limit: {
          primary_window: {
            used_percent: 99,
            reset_at: 1_700_100_000,
          },
          secondary_window: {
            used_percent: 88,
            reset_at: 1_700_200_000,
          },
        },
      },
    ],
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.model, "default");
  assert.equal(summaries[1]?.model, "gpt-5.3-codex-spark");
  assert.equal(summaries[1]?.modelLabel, "GPT-5.3-Codex-Spark limit");
  assert.equal(summaries[1]?.fiveHourUsedPercent, 99);
  assert.equal(summaries[1]?.weeklyUsedPercent, 88);
});

test("prefers primary model summaries while appending additional summaries", () => {
  const payload: CodexUsagePayload = {
    rate_limit: {
      models: [
        {
          model: "gpt-5.3-codex",
          primary_window: {
            used_percent: 75,
            reset_at: 1_700_300_000,
          },
          secondary_window: {
            used_percent: 55,
            reset_at: 1_700_400_000,
          },
        },
      ],
    },
    additional_rate_limits: [
      {
        metered_feature: "gpt-5.3-codex-spark",
        rate_limit: {
          primary_window: {
            used_percent: 62,
            reset_at: 1_700_500_000,
          },
          secondary_window: {
            used_percent: 44,
            reset_at: 1_700_600_000,
          },
        },
      },
    ],
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.model, "gpt-5.3-codex");
  assert.equal(summaries[1]?.model, "gpt-5.3-codex-spark");
  assert.equal(summaries[1]?.fiveHourUsedPercent, 62);
});

test("extracts additional rate limits when API returns them as a model map", () => {
  const payload: CodexUsagePayload = {
    plan_type: "new-plan",
    rate_limit: {
      models: [
        {
          model: "gpt-5.3-codex",
          primary_window: {
            used_percent: 40,
            reset_at: 1_700_900_000,
          },
          secondary_window: {
            used_percent: 50,
            reset_at: 1_700_900_100,
          },
        },
      ],
    },
    additional_rate_limits: {
      "gpt-5.3-codex-spark": {
        limit_name: "GPT-5.3-Codex-Spark limit",
        rate_limit: {
          primary_window: {
            used_percent: 15,
            reset_at: 1_700_900_200,
          },
          secondary_window: {
            used_percent: 22,
            reset_at: 1_700_900_300,
          },
        },
      },
    },
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.model, "gpt-5.3-codex");
  assert.equal(summaries[1]?.model, "gpt-5.3-codex-spark");
  assert.equal(summaries[1]?.modelLabel, "GPT-5.3-Codex-Spark limit");
  assert.equal(summaries[1]?.fiveHourUsedPercent, 15);
});

test("maps internal model identifier to known spark model", () => {
  const payload: CodexUsagePayload = {
    plan_type: "legacy-plan",
    rate_limit: {
      models: [
        {
          model: "codex_bengalfox",
          modelLabel: "codex_bengalfox",
          primary_window: {
            used_percent: 96,
            reset_at: 1_700_200_000,
          },
          secondary_window: {
            used_percent: 99,
            reset_at: 1_700_300_000,
          },
        },
      ],
    },
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.model, "gpt-5.3-codex-spark");
  assert.equal(summaries[0]?.modelLabel, undefined);
});

test("extracts additional rate limits even if details embed windows directly", () => {
  const payload: CodexUsagePayload = {
    plan_type: "new-plan",
    rate_limit: {
      models: [
        {
          model: "gpt-5.3-codex",
          primary_window: {
            used_percent: 20,
            reset_at: 1_700_900_000,
          },
          secondary_window: {
            used_percent: 30,
            reset_at: 1_700_900_100,
          },
        },
      ],
    },
    additional_rate_limits: [
      {
        metered_feature: "gpt-5.3-codex-spark",
        primary_window: {
          used_percent: 18,
          reset_at: 1_700_900_200,
        },
        secondary_window: {
          used_percent: 21,
          reset_at: 1_700_900_300,
        },
      },
    ],
  };

  const summaries = extractCodexUsageModelSummaries(payload);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.model, "gpt-5.3-codex");
  assert.equal(summaries[1]?.model, "gpt-5.3-codex-spark");
  assert.equal(summaries[1]?.fiveHourUsedPercent, 18);
});
