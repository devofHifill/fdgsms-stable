// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gapToMs,
  parseGap,
  effectiveGapMs,
  formatGap,
  msToGap,
  textsPerDay,
  GAP_FLOOR_MS,
} from "../utils/campaignGap.js";
import { gapNotElapsed } from "../jobs/automationWorker.js";

test("gap units convert to milliseconds", () => {
  assert.equal(gapToMs({ value: 30, unit: "seconds" }), 30000);
  assert.equal(gapToMs({ value: 2, unit: "minutes" }), 120000);
  assert.equal(gapToMs({ value: 1, unit: "hours" }), 3600000);
  assert.equal(gapToMs({ value: 0.5, unit: "minutes" }), 30000);
});

test("a gap below 5 seconds is refused, whatever the minimum", () => {
  assert.match(parseGap({ value: 4, unit: "seconds" }).error, /5 seconds/);
  assert.match(parseGap({ value: 0, unit: "seconds" }).error, /positive/);
  assert.match(parseGap({ value: 10, unit: "days" }).error, /seconds, minutes or hours/);
  assert.deepEqual(parseGap({ value: 5, unit: "seconds" }).gap, { value: 5, unit: "seconds" });
});

test("a campaign gap below the Settings minimum is refused", () => {
  const minMs = 60000; // minimum set to 1 minute
  assert.match(parseGap({ value: 30, unit: "seconds" }, { minMs }).error, /1 minute/);
  assert.ok(parseGap({ value: 2, unit: "minutes" }, { minMs }).gap);
});

test("effective gap = the larger of campaign gap, minimum and 5 s floor", () => {
  assert.equal(effectiveGapMs({ value: 30, unit: "seconds" }, { value: 5, unit: "seconds" }), 30000);
  assert.equal(effectiveGapMs({ value: 30, unit: "seconds" }, { value: 2, unit: "minutes" }), 120000);
  assert.equal(effectiveGapMs({ value: 1, unit: "seconds" }, { value: 1, unit: "seconds" }), GAP_FLOOR_MS);
  assert.equal(effectiveGapMs(undefined, undefined), 30000); // old campaign → 30 s default
});

test("texts per day fit the sending window", () => {
  assert.equal(textsPerDay(30000, 12), 1440); // 30 s gap, 9am–9pm
  assert.equal(textsPerDay(45000, 12), 960);
  assert.equal(textsPerDay(5000, 12), 8640);
});

test("formatting", () => {
  assert.equal(formatGap({ value: 1, unit: "minutes" }), "1 minute");
  assert.equal(formatGap({ value: 30, unit: "seconds" }), "30 seconds");
  assert.deepEqual(msToGap(120000), { value: 2, unit: "minutes" });
  assert.deepEqual(msToGap(5000), { value: 5, unit: "seconds" });
});

test("gap not elapsed until gapMs after the campaign's last text", () => {
  const now = new Date("2026-11-27T12:00:30Z");
  assert.equal(gapNotElapsed({ lastCampaignSendAt: new Date("2026-11-27T12:00:10Z") }, 30000, now), true);
  assert.equal(gapNotElapsed({ lastCampaignSendAt: new Date("2026-11-27T12:00:00Z") }, 30000, now), false);
  assert.equal(gapNotElapsed({ lastCampaignSendAt: null }, 30000, now), false);
});
