import assert from "node:assert/strict";
import test from "node:test";

import {
  extractListIdsFromText,
  getTaskListTypeValidationError,
  replaceListTokensInText,
} from "../../src/lib/list-tokens";

test("extractListIdsFromText returns unique lowercase list IDs", () => {
  const ids = extractListIdsFromText(
    "use $list-country-codes and $list-ios-langs-2026 then $list-country-codes again",
  );
  assert.deepEqual(ids, ["country-codes", "ios-langs-2026"]);
});

test("extractListIdsFromText ignores invalid placeholders", () => {
  const ids = extractListIdsFromText("bad $list- and $list-ABC and $list-_123");
  assert.deepEqual(ids, []);
});

test("replaceListTokensInText replaces known ids and keeps unknown tokens", () => {
  const replaced = replaceListTokensInText(
    "A: $list-a B: $list-b",
    new Map([
      ["a", ["one", "two"]],
    ]),
  );
  assert.equal(replaced, "A: one, two B: $list-b");
});

test("getTaskListTypeValidationError allows repeated usage of a single list ID", () => {
  const validationError = getTaskListTypeValidationError(
    "translate into $list-ios-langs and then validate for $list-ios-langs",
  );
  assert.equal(validationError, null);
});

test("getTaskListTypeValidationError rejects multiple list IDs", () => {
  const validationError = getTaskListTypeValidationError(
    "use $list-ios-langs for locale and $list-country-codes for region",
  );
  assert.equal(
    validationError,
    "Task can reference only one list type. Found: $list-ios-langs, $list-country-codes",
  );
});
