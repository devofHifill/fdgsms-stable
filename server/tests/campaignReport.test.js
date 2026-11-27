// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  windowHours,
  dayKey,
  lastDayKeys,
  nthSendingDay,
  lastStepAfter,
  estimateFinish,
} from "../utils/campaignReport.js";
import { parseTwilioPrice } from "../services/messagePriceService.js";

const NY = "America/New_York";
// Friday 27 Nov 2026, 15:00 New York.
const NOW = new Date("2026-11-27T20:00:00Z");

test("window hours: normal, wrapping and always-open windows", () => {
  assert.equal(windowHours({ startHour: 9, endHour: 21 }), 12);
  assert.equal(windowHours({ startHour: 20, endHour: 6 }), 10);
  assert.equal(windowHours({ startHour: 0, endHour: 0 }), 24);
});

test("day keys are read in the account timezone", () => {
  assert.equal(dayKey(new Date("2026-11-28T03:00:00Z"), NY), "2026-11-27");
  assert.equal(dayKey(new Date("2026-11-28T03:00:00Z"), "UTC"), "2026-11-28");
  const keys = lastDayKeys(NOW, 3, NY);
  assert.deepEqual(keys, ["2026-11-25", "2026-11-26", "2026-11-27"]);
});

test("nth sending day skips days the campaign doesn't send", () => {
  // Weekdays only; today is Friday → 1st = today, 2nd = Monday.
  const weekdays = [1, 2, 3, 4, 5];
  assert.equal(dayKey(nthSendingDay(NOW, 1, weekdays, NY), NY), "2026-11-27");
  assert.equal(dayKey(nthSendingDay(NOW, 2, weekdays, NY), NY), "2026-11-30");
  assert.equal(dayKey(nthSendingDay(NOW, 6, weekdays, NY), NY), "2026-12-04");
});

test("last step time adds delays and respects fixed-date steps", () => {
  const steps = [
    { stepNumber: 1 },
    { stepNumber: 2, delayHours: 24 },
    { stepNumber: 3, start: { type: "fixedAt", at: new Date("2026-12-10T14:00:00Z"), minWaitHours: 48 } },
  ];
  assert.equal(lastStepAfter(NOW, steps).toISOString(), "2026-12-10T14:00:00.000Z");
  // If the contact's step 2 is later than the fixed date, the minimum wait wins.
  const late = new Date("2026-12-12T00:00:00Z");
  assert.equal(lastStepAfter(late, steps).toISOString(), "2026-12-15T00:00:00.000Z");
});

test("estimate uses the target, capped by what the gap allows", () => {
  const e = estimateFinish({ now: NOW, notStarted: 250, target: 100, capacityPerDay: 1440, timeZone: NY, steps: [{ stepNumber: 1 }] });
  assert.equal(e.status, "estimated");
  assert.equal(e.basis, "target");
  assert.equal(e.sendingDaysNeeded, 3);
  assert.equal(dayKey(e.step1DoneAt, NY), "2026-11-29");

  const capped = estimateFinish({ now: NOW, notStarted: 250, target: 100, capacityPerDay: 50, timeZone: NY });
  assert.equal(capped.basis, "target_capped_by_gap");
  assert.equal(capped.sendingDaysNeeded, 5);
});

test("estimate falls back to the recent pace, then to the gap", () => {
  assert.equal(estimateFinish({ now: NOW, notStarted: 40, recentPerDay: 20, capacityPerDay: 1000, timeZone: NY }).basis, "recent");
  assert.equal(estimateFinish({ now: NOW, notStarted: 40, capacityPerDay: 1000, timeZone: NY }).basis, "gap");
  assert.equal(estimateFinish({ now: NOW, notStarted: 40, timeZone: NY }).status, "unknown");
});

test("an end rule before the estimate caps it and counts who won't start", () => {
  const e = estimateFinish({
    now: NOW, notStarted: 1000, target: 100, capacityPerDay: 2000, timeZone: NY,
    endsAt: new Date(NOW.getTime() + 3 * 864e5),
  });
  assert.equal(e.cappedByEnd, true);
  assert.equal(e.wontStart, 700);
});

test("stopped, completed, paused and follow-ups-only states", () => {
  assert.equal(estimateFinish({ state: "stopped", notStarted: 5 }).status, "stopped");
  assert.equal(estimateFinish({ state: "completed" }).status, "completed");
  assert.equal(estimateFinish({ notStarted: 0, inProgress: 0 }).status, "done");
  assert.equal(estimateFinish({ now: NOW, notStarted: 0, inProgress: 3 }).status, "followUpsOnly");
  assert.equal(estimateFinish({ now: NOW, isActive: false, notStarted: 10, target: 5, timeZone: NY }).status, "paused");
});

test("Twilio prices are stored as positive amounts", () => {
  assert.equal(parseTwilioPrice("-0.00830"), 0.0083);
  assert.equal(parseTwilioPrice(null), null);
  assert.equal(parseTwilioPrice(""), null);
  assert.equal(parseTwilioPrice("abc"), null);
});
