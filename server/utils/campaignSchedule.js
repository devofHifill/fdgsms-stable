// campaignSchedule.js → campaign plan C4: when a campaign runs.
//
// - Sending days: weekdays the campaign may text (account timezone). A step
//   due on another day simply waits for the next sending day (Q14).
// - Start: nothing is sent before it (empty = straight away).
// - End rules: after N days, after N weeks, after a date, and/or when every
//   contact has had step 1. Whichever comes first (Q13). After the end no new
//   contacts start; contacts already in the sequence finish (Q3 → "let finish").
// - Step start (steps 2+): "after the previous step" (delay, counted from the
//   previous step's delivery) or "from a fixed date" = a not-before date plus a
//   minimum wait after that contact's own previous step (Q1, Q1b).
import { zonedDateTimeToDate, dayOfWeekInTimeZone, startOfDayInTimeZone } from "./timezone.js";

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function positiveIntOrNull(v, label, max) {
  if (v === undefined || v === null || v === "") return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) return { error: `${label} must be a whole number from 1 to ${max}` };
  return { value: n };
}

// Client input → stored schedule, or { error }. Dates are read in timeZone.
export function parseSchedule(input = {}, timeZone) {
  const sendDays = Array.isArray(input.sendDays)
    ? [...new Set(input.sendDays.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
    : ALL_DAYS;
  if (!sendDays.length) return { error: "Pick at least one sending day" };

  let startAt = null;
  if (input.startDate) {
    startAt = zonedDateTimeToDate(input.startDate, input.startTime || "00:00", timeZone);
    if (!startAt) return { error: "Start date/time is not valid" };
  }

  const days = positiveIntOrNull(input.endAfterDays, "End after days", 3650);
  if (days.error) return { error: days.error };
  const weeks = positiveIntOrNull(input.endAfterWeeks, "End after weeks", 520);
  if (weeks.error) return { error: weeks.error };

  let endOn = null;
  if (input.endOnDate) {
    // "Ends after Dec 31" → stops at midnight starting Jan 1 (account timezone).
    const dayStart = zonedDateTimeToDate(input.endOnDate, "00:00", timeZone);
    if (!dayStart) return { error: "End date is not valid" };
    endOn = startOfDayInTimeZone(new Date(dayStart.getTime() + DAY_MS + 2 * HOUR_MS), timeZone);
    if (startAt && endOn <= startAt) return { error: "End date must be after the start" };
  }

  return {
    schedule: {
      sendDays,
      startAt,
      endAfterDays: days.value,
      endAfterWeeks: weeks.value,
      endOn,
      untilContactsRunOut: Boolean(input.untilContactsRunOut),
    },
  };
}

// Step 2+ start rule → stored, or { error }.
export function parseStepStart(input, timeZone) {
  if (!input || input.type !== "fixedAt") return { start: { type: "afterPrevious", at: null, minWaitHours: 24 } };
  const at = zonedDateTimeToDate(input.date, input.time || "09:00", timeZone);
  if (!at) return { error: "A fixed-date step needs a valid date" };
  const minWaitHours = input.minWaitHours === undefined || input.minWaitHours === "" ? 24 : Number(input.minWaitHours);
  if (!Number.isFinite(minWaitHours) || minWaitHours < 0 || minWaitHours > 24 * 365) {
    return { error: "Minimum wait must be 0 or more hours" };
  }
  return { start: { type: "fixedAt", at, minWaitHours } };
}

// The moment the campaign stops starting new contacts because of its date
// rules (null = no date rule). Days/weeks count from the start (or creation).
export function computeEndsAt(campaign) {
  const s = campaign?.schedule || {};
  const base = new Date(s.startAt || campaign?.createdAt || Date.now()).getTime();
  const candidates = [];
  if (s.endAfterDays) candidates.push(base + s.endAfterDays * DAY_MS);
  if (s.endAfterWeeks) candidates.push(base + s.endAfterWeeks * 7 * DAY_MS);
  if (s.endOn) candidates.push(new Date(s.endOn).getTime());
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

export function hasStarted(campaign, now = new Date()) {
  const startAt = campaign?.schedule?.startAt;
  return !startAt || new Date(startAt).getTime() <= now.getTime();
}

export function isSendingDay(campaign, now, timeZone) {
  const days = campaign?.schedule?.sendDays?.length ? campaign.schedule.sendDays : ALL_DAYS;
  return days.includes(dayOfWeekInTimeZone(now, timeZone));
}

// May the campaign start NEW contacts (step 1) right now?
export function acceptsNewContacts(campaign, now = new Date()) {
  if ((campaign?.state || "running") !== "running") return false;
  const endsAt = computeEndsAt(campaign);
  return !endsAt || now.getTime() < endsAt.getTime();
}

// What the worker stores while a contact waits for delivery of the previous
// step: delay after delivery, and (fixed-date steps) the not-before date.
export function waitForStep(step) {
  if (step?.start?.type === "fixedAt" && step.start.at) {
    return {
      delayMs: Math.max(Number(step.start.minWaitHours ?? 24), 0) * HOUR_MS,
      notBefore: new Date(step.start.at),
    };
  }
  return { delayMs: Math.max(Number(step?.delayHours || 0), 0) * HOUR_MS, notBefore: null };
}
