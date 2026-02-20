import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestAppSyncEvent,
  publishAppSync,
  resetAppSyncStateForTests,
  subscribeToAppSync,
} from "../../src/lib/live-sync";

test("publishAppSync increments revision and notifies subscribers", () => {
  resetAppSyncStateForTests();

  const seen: string[] = [];
  const unsubscribe = subscribeToAppSync((event) => {
    seen.push(`${event.revision}:${event.reason}`);
  });

  publishAppSync("task.created");
  publishAppSync("task.done");
  unsubscribe();

  assert.deepEqual(seen, ["1:task.created", "2:task.done"]);
  assert.equal(getLatestAppSyncEvent().revision, 2);
});

test("unsubscribe stops event delivery", () => {
  resetAppSyncStateForTests();

  let received = 0;
  const unsubscribe = subscribeToAppSync(() => {
    received += 1;
  });

  publishAppSync("project.updated");
  unsubscribe();
  publishAppSync("project.updated");

  assert.equal(received, 1);
});
