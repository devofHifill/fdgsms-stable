// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getHourInTimeZone,
  isValidTimeZone,
  isWithinSendingWindow,
} from "../utils/timezone.js";

const nineToSix = { startHour: 9, endHour: 18 };

test("hour is read in the account timezone, not UTC", () => {
  const winter = new Date("2026-11-26T14:00:00Z"); // EST = UTC-5
  assert.equal(getHourInTimeZone(winter, "America/New_York"), 9);
  assert.equal(getHourInTimeZone(winter, "America/Los_Angeles"), 6);
  assert.equal(getHourInTimeZone(winter, "UTC"), 14);
});

test("daylight saving time is handled", () => {
  const summer = new Date("2026-07-01T13:00:00Z"); // EDT = UTC-4
  assert.equal(getHourInTimeZone(summer, "America/New_York"), 9);
  assert.equal(getHourInTimeZone(summer, "America/Phoenix"), 6); // no DST
});

test("13:30 UTC in November is 8:30am Eastern → outside 9–18 Eastern", () => {
  const now = new Date("2026-11-26T13:30:00Z");
  assert.equal(isWithinSendingWindow(now, nineToSix, "America/New_York"), false);
  // The old server-clock (UTC) behaviour would have sent:
  assert.equal(isWithinSendingWindow(now, nineToSix, "UTC"), true);
});

test("inside the window at 9am and 5pm Eastern, outside at 6pm", () => {
  assert.equal(isWithinSendingWindow(new Date("2026-11-26T14:00:00Z"), nineToSix, "America/New_York"), true);
  assert.equal(isWithinSendingWindow(new Date("2026-11-26T22:59:00Z"), nineToSix, "America/New_York"), true);
  assert.equal(isWithinSendingWindow(new Date("2026-11-26T23:00:00Z"), nineToSix, "America/New_York"), false);
});

test("a window that wraps midnight works", () => {
  const night = { startHour: 20, endHour: 6 };
  assert.equal(isWithinSendingWindow(new Date("2026-11-27T03:00:00Z"), night, "America/New_York"), true); // 10pm
  assert.equal(isWithinSendingWindow(new Date("2026-11-26T17:00:00Z"), night, "America/New_York"), false); // noon
});

test("invalid timezone falls back to Eastern; validity check", () => {
  assert.equal(isValidTimeZone("America/Chicago"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(getHourInTimeZone(new Date("2026-11-26T14:00:00Z"), "Mars/Olympus"), 9);
});
