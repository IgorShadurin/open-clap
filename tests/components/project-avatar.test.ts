import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectAvatar,
  getProjectAvatarPalette,
  getProjectInitials,
} from "../../src/components/task-controls/project-avatar";

test("getProjectInitials uses first letters from first two words", () => {
  assert.equal(getProjectInitials("alpha beta gamma"), "AB");
});

test("getProjectInitials uses first two letters for one-word names", () => {
  assert.equal(getProjectInitials("project"), "PR");
  assert.equal(getProjectInitials("x"), "XX");
});

test("getProjectAvatarPalette is deterministic for matching initials", () => {
  const first = getProjectAvatarPalette("AB");
  const second = getProjectAvatarPalette("AB");

  assert.deepEqual(first, second);
});

test("buildProjectAvatar returns initials with generated color values", () => {
  const avatar = buildProjectAvatar("Open Clap");

  assert.equal(avatar.initials, "OC");
  assert.match(avatar.backgroundColor, /^hsl\(\d+ \d+% \d+%\)$/);
  assert.match(avatar.borderColor, /^hsl\(\d+ \d+% \d+%\)$/);
  assert.equal(avatar.textColor, "#ffffff");
});
