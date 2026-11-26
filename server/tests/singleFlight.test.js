// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { singleFlight } from "../utils/singleFlight.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("a call made while a run is in progress is skipped", async () => {
  let calls = 0;
  let release;
  const run = singleFlight(async () => {
    calls += 1;
    await new Promise((resolve) => (release = resolve));
    return "done";
  });

  const first = run();
  await tick();
  assert.equal(run.isRunning(), true);
  assert.equal(await run(), undefined); // overlapping tick → skipped

  release();
  assert.equal(await first, "done");
  assert.equal(calls, 1);
  assert.equal(run.isRunning(), false);
});

test("runs again once the previous run has finished", async () => {
  let calls = 0;
  const run = singleFlight(async () => {
    calls += 1;
  });

  await run();
  await run();
  assert.equal(calls, 2);
});

test("a run that throws still releases the guard", async () => {
  let calls = 0;
  const run = singleFlight(async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
  });

  await assert.rejects(run(), /boom/);
  assert.equal(run.isRunning(), false);
  await run();
  assert.equal(calls, 2);
});
