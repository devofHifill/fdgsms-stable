// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedDateTimeToDate, dayOfWeekInTimeZone } from "../utils/timezone.js";
import {
  parseSchedule,
  parseStepStart,
  computeEndsAt,
  hasStarted,
  isSendingDay,
  acceptsNewContacts,
  waitForStep,
} from "../utils/campaignSchedule.js";

const NY = "America/New_York";

test("a date/time typed in the account timezone becomes the right moment", () => {
  assert.equal(zonedDateTimeToDate("2026-12-01", "09:00", NY).toISOString(), "2026-12-01T14:00:00.000Z"); // EST
  assert.equal(zonedDateTimeToDate("2026-07-01", "09:00", NY).toISOString(), "2026-07-01T13:00:00.000Z"); // EDT
  assert.equal(zonedDateTimeToDate("2026-12-01", "09:00", "UTC").toISOString(), "2026-12-01T09:00:00.000Z");
  assert.equal(zonedDateTimeToDate("2026-13-01", "09:00", NY), null);
  assert.equal(zonedDateTimeToDate("", "09:00", NY), null);
});

test("day of week is read in the account timezone", () => {
  // Sat 28 Nov 2026, 02:00 UTC = Fri 27 Nov, 9 PM Eastern
  assert.equal(dayOfWeekInTimeZone(new Date("2026-11-28T02:00:00Z"), NY), 5);
  assert.equal(dayOfWeekInTimeZone(new Date("2026-11-28T02:00:00Z"), "UTC"), 6);
});

test("schedule parsing: defaults, validation, end-after-date stops at the following midnight", () => {
  const def = parseSchedule({}, NY).schedule;
  assert.deepEqual(def.sendDays, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(def.startAt, null);
  assert.match(parseSchedule({ sendDays: [] }, NY).error, /at least one/);
  assert.match(parseSchedule({ endAfterDays: 0 }, NY).error, /whole number/);
  const s = parseSchedule({ sendDays: [1, 2, 3, 4, 5], startDate: "2026-12-01", startTime: "09:00", endOnDate: "2026-12-31" }, NY).schedule;
  assert.equal(s.startAt.toISOString(), "2026-12-01T14:00:00.000Z");
  assert.equal(s.endOn.toISOString(), "2027-01-01T05:00:00.000Z"); // midnight Eastern after Dec 31
  assert.match(parseSchedule({ startDate: "2026-12-10", endOnDate: "2026-12-01" }, NY).error, /after the start/);
});

test("end = whichever comes first; days/weeks count from the start", () => {
  const c = { schedule: { startAt: new Date("2026-12-01T14:00:00Z"), endAfterDays: 14, endAfterWeeks: 3, endOn: new Date("2027-01-01T05:00:00Z") } };
  assert.equal(computeEndsAt(c).toISOString(), "2026-12-15T14:00:00.000Z");
  assert.equal(computeEndsAt({ schedule: {} }), null);
});

test("start, sending days and new-contact gate", () => {
  const c = { state: "running", schedule: { startAt: new Date("2026-12-01T14:00:00Z"), sendDays: [1, 2, 3, 4, 5], endAfterDays: 14 } };
  assert.equal(hasStarted(c, new Date("2026-11-30T00:00:00Z")), false);
  assert.equal(hasStarted(c, new Date("2026-12-01T14:00:00Z")), true);
  assert.equal(isSendingDay(c, new Date("2026-12-05T15:00:00Z"), NY), false); // Saturday
  assert.equal(isSendingDay(c, new Date("2026-12-07T15:00:00Z"), NY), true); // Monday
  assert.equal(acceptsNewContacts(c, new Date("2026-12-10T00:00:00Z")), true);
  assert.equal(acceptsNewContacts(c, new Date("2026-12-16T00:00:00Z")), false); // past 14 days
  assert.equal(acceptsNewContacts({ ...c, state: "finishing" }, new Date("2026-12-10T00:00:00Z")), false);
});

test("step start rules: after previous vs fixed date + minimum wait", () => {
  assert.deepEqual(waitForStep({ delayHours: 2 }), { delayMs: 7200000, notBefore: null });
  const fixed = parseStepStart({ type: "fixedAt", date: "2026-12-03", time: "09:00", minWaitHours: 24 }, NY).start;
  assert.equal(fixed.at.toISOString(), "2026-12-03T14:00:00.000Z");
  const w = waitForStep({ delayHours: 99, start: fixed });
  assert.equal(w.delayMs, 24 * 3600000);
  assert.equal(w.notBefore.toISOString(), "2026-12-03T14:00:00.000Z");
  assert.match(parseStepStart({ type: "fixedAt", date: "" }, NY).error, /valid date/);
});
