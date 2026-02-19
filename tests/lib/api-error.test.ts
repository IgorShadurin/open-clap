import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { createApiError } from "../../src/lib/api-error";

test("createApiError returns standard API error shape", () => {
  const error = createApiError(
    "INVALID_PATH",
    "Field `path` must be a string",
    "Received: number",
  );

  assert.deepEqual(error, {
    details: "Received: number",
    error: {
      code: "INVALID_PATH",
      message: "Field `path` must be a string",
    },
  });
});
