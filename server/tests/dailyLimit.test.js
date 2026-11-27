// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfDayInTimeZone } from "../utils/timezone.js";
import {
  step1Room,
  normalizeLimit,
  platformLimitOf,
  DEFAULT_PLATFORM_DAILY_LIMIT,
} from "../services/dailyLimitService.js";

test("today starts at midnight in the account timezone (winter, EST = UTC-5)", () => {
  const now = new Date("2026-11-27T11:25:00Z"); // 6:25 AM Eastern
  assert.equal(startOfDayInTimeZone(now, "America/New_York").toISOString(), "2026-11-27T05:00:00.000Z");
  assert.equal(startOfDayInTimeZone(now, "UTC").toISOString(), "2026-11-27T00:00:00.000Z");
  assert.equal(startOfDayInTimeZone(now, "America/Los_Angeles").toISOString(), "2026-11-27T08:00:00.000Z");
});

test("late evening Eastern is still the same Eastern day, though UTC has moved on", () => {
  const now = new Date("2026-11-28T03:30:00Z"); // 10:30 PM Eastern on the 27th
  assert.equal(startOfDayInTimeZone(now, "America/New_York").toISOString(), "2026-11-27T05:00:00.000Z");
});

test("summer time (EDT = UTC-4)", () => {
  const now = new Date("2026-07-01T15:00:00Z");
  assert.equal(startOfDayInTimeZone(now, "America/New_York").toISOString(), "2026-07-01T04:00:00.000Z");
});

test("step-1 room: target minus delivered minus waiting, never below 0", () => {
  assert.equal(step1Room(300, { delivered: 120, waiting: 5 }), 175);
  assert.equal(step1Room(300, { delivered: 300, waiting: 0 }), 0);
  assert.equal(step1Room(300, { delivered: 298, waiting: 4 }), 0);
  assert.equal(step1Room(null, { delivered: 999, waiting: 9 }), Infinity);
});

test("limits: empty or invalid means no limit; settings default to 2,000", () => {
  assert.equal(normalizeLimit(""), null);
  assert.equal(normalizeLimit(null), null);
  assert.equal(normalizeLimit(0), null);
  assert.equal(normalizeLimit(2.5), null);
  assert.equal(normalizeLimit(300), 300);
  assert.equal(platformLimitOf({}), DEFAULT_PLATFORM_DAILY_LIMIT);
  assert.equal(platformLimitOf({ platformDailySmsLimit: null }), null);
  assert.equal(platformLimitOf({ platformDailySmsLimit: 800 }), 800);
});
