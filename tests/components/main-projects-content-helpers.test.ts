import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { resolveModelCardSortRank } from "../../src/components/main-projects-page/content-helpers";

test("resolveModelCardSortRank keeps gpt-5.3-codex before spark cards", () => {
  assert.equal(resolveModelCardSortRank("gpt-5.3-codex"), 0);
  assert.equal(resolveModelCardSortRank("default"), 0);
  assert.equal(resolveModelCardSortRank("gpt-5.3-codex-spark"), 1);
});
