import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { createImmediateActionPoller } from "../../scripts/daemon/immediate-action-poller";

test("immediate action poller calls onPoll repeatedly and stops", async () => {
  let calls = 0;
  const poller = createImmediateActionPoller({
    intervalMs: 10,
    onPoll: () => {
      calls += 1;
    },
  });

  poller.start();
  await new Promise((resolve) => setTimeout(resolve, 35));
  poller.stop();

  const callsAfterStop = calls;
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(callsAfterStop >= 2, true);
  assert.equal(calls, callsAfterStop);
});
