import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { normalizeUserPath, validatePathExists } from "../../src/lib/path-validation";

test("normalizeUserPath rejects empty values", () => {
  assert.throws(() => normalizeUserPath("   "), /Path is required/);
});

test("validatePathExists returns exists=true for current directory", async () => {
  const result = await validatePathExists(".");

  assert.equal(result.exists, true);
  assert.equal(result.isDirectory, true);
  assert.equal(result.normalizedPath, path.normalize(process.cwd()));
});

test("validatePathExists returns exists=false for missing path", async () => {
  const result = await validatePathExists("./definitely-missing-path-12345");

  assert.equal(result.exists, false);
  assert.equal(result.isDirectory, false);
  assert.equal(result.normalizedPath.endsWith("definitely-missing-path-12345"), true);
});
