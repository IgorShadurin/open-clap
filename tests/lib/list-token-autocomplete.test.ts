import assert from "node:assert/strict";
import test from "node:test";

import {
  filterListIdsForQuery,
  findListTokenQueryAtCursor,
  replaceRangeWithListToken,
} from "../../src/lib/list-token-autocomplete";

test("findListTokenQueryAtCursor matches $list- and partial ids", () => {
  const text = "Do this for $list-ios";
  const match = findListTokenQueryAtCursor(text, text.length);

  assert.ok(match);
  assert.equal(match.start, "Do this for ".length);
  assert.equal(match.end, text.length);
  assert.equal(match.query, "ios");

  const prefixed = findListTokenQueryAtCursor("Use $list-", "Use $list-".length);
  assert.ok(prefixed);
  assert.equal(prefixed.query, "");

  const bare = findListTokenQueryAtCursor("Use $list", "Use $list".length);
  assert.equal(bare, null);
});

test("findListTokenQueryAtCursor works in the middle of surrounding text", () => {
  const text = "before $list-io after";
  const cursor = "before $list-io".length;
  const match = findListTokenQueryAtCursor(text, cursor);
  assert.ok(match);
  assert.equal(match.start, "before ".length);
  assert.equal(match.end, "before $list-io".length);
  assert.equal(match.query, "io");
});

test("filterListIdsForQuery prioritizes startsWith then contains", () => {
  const result = filterListIdsForQuery(
    ["ios-langs", "country-codes", "langs-eu", "ios-countries"],
    "langs",
  );
  assert.deepEqual(result, ["langs-eu", "ios-langs"]);
});

test("replaceRangeWithListToken inserts normalized token", () => {
  const text = "Run for $list-io right now";
  const replaced = replaceRangeWithListToken(
    text,
    {
      end: "Run for $list-io".length,
      query: "io",
      start: "Run for ".length,
    },
    "ios-langs",
  );

  assert.equal(replaced, "Run for $list-ios-langs right now");
});

test("replaceRangeWithListToken replaces full token when cursor is in the middle", () => {
  const text = "Run $list-iotemp now";
  const cursor = "Run $list-io".length;
  const match = findListTokenQueryAtCursor(text, cursor);
  assert.ok(match);
  if (!match) {
    throw new Error("Expected match");
  }

  const replaced = replaceRangeWithListToken(text, match, "ios-langs");
  assert.equal(replaced, "Run $list-ios-langs now");
});
