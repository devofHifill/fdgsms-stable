// campaignReport.js → campaign plan C6: maths for the campaign report page.
import { dayOfWeekInTimeZone, isValidTimeZone, DEFAULT_TIMEZONE } from "./timezone.js";
import { ALL_DAYS } from "./campaignSchedule.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Hours per day the sending window is open. start === end means always open.
export function windowHours(sendingWindow) {
  const start = Number(sendingWindow?.startHour ?? 9);
  const end = Number(sendingWindow?.endHour ?? 18);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return 24;
  return start < end ? end - start : 24 - start + end;
}

// "YYYY-MM-DD" of `date` in the account timezone.
export function dayKey(date, timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// The last `days` day keys, oldest first, ending today.
export function lastDayKeys(now, days, timeZone) {
  const keys = [];
  // A repeated key (DST change) is dropped.
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * DAY_MS), timeZone);
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

// Walk forward from `from` and return the start of the day on which the
// `needed`-th sending day falls (today counts if it is a sending day).
// Returns null if it is further than ~10 years out.
export function nthSendingDay(from, needed, sendDays, timeZone) {
  const days = sendDays?.length ? sendDays : ALL_DAYS;
  if (needed <= 0) return new Date(from);
  let count = 0;
  for (let i = 0; i < 3660; i++) {
    const d = new Date(from.getTime() + i * DAY_MS);
    if (days.includes(dayOfWeekInTimeZone(d, timeZone))) {
      count += 1;
      if (count >= needed) return d;
    }
  }
  return null;
}

// Time from a contact's step 1 to its last step (delays, fixed dates).
export function lastStepAfter(step1At, steps = []) {
  const sorted = [...steps].sort((a, b) => Number(a.stepNumber) - Number(b.stepNumber)).slice(1);
  let at = step1At.getTime();
  for (const s of sorted) {
    if (s.start?.type === "fixedAt" && s.start.at) {
      at = Math.max(new Date(s.start.at).getTime(), at + Number(s.start.minWaitHours ?? 24) * HOUR_MS);
    } else {
      at += Math.max(Number(s.delayHours || 0), 0) * HOUR_MS;
    }
  }
  return new Date(at);
}

// Estimated finish of a campaign.
//  notStarted:    contacts still waiting for step 1
//  target:        campaign's step-1-delivered-per-day target (or null)
//  recentPerDay:  average step-1 delivered per sending day lately (or 0)
//  capacityPerDay: texts the gap allows per day in the window
//  endsAt:        date rule after which no new contacts start (or null)
export function estimateFinish({
  now = new Date(),
  state = "running",
  isActive = true,
  notStarted = 0,
  inProgress = 0,
  target = null,
  recentPerDay = 0,
  capacityPerDay = 0,
  sendDays,
  timeZone,
  steps = [],
  endsAt = null,
}) {
  if (state === "stopped") return { status: "stopped" };
  if (state === "completed") return { status: "completed" };
  if (!notStarted && !inProgress) return { status: "done" };

  // Only follow-ups left (finishing, or everyone has had step 1).
  if (!notStarted || state === "finishing") {
    return {
      status: isActive ? "followUpsOnly" : "paused",
      finishAt: lastStepAfter(now, steps),
      notStarted,
      wontStart: state === "finishing" ? notStarted : 0,
    };
  }

  let perDay = 0;
  let basis = "none";
  if (target) {
    perDay = target;
    basis = "target";
  } else if (recentPerDay > 0) {
    perDay = recentPerDay;
    basis = "recent";
  } else if (capacityPerDay > 0) {
    perDay = capacityPerDay;
    basis = "gap";
  }
  if (capacityPerDay > 0 && perDay > capacityPerDay) {
    perDay = capacityPerDay;
    basis = `${basis}_capped_by_gap`;
  }
  if (!perDay) return { status: "unknown", notStarted };

  const sendingDaysNeeded = Math.ceil(notStarted / perDay);
  const lastStep1Day = nthSendingDay(now, sendingDaysNeeded, sendDays, timeZone);
  if (!lastStep1Day) return { status: "unknown", notStarted };

  let wontStart = 0;
  let step1DoneAt = lastStep1Day;
  let cappedByEnd = false;
  if (endsAt && new Date(endsAt).getTime() < lastStep1Day.getTime()) {
    cappedByEnd = true;
    step1DoneAt = new Date(endsAt);
    // Sending days left before the end rule → contacts that still start.
    let days = 0;
    for (let t = now.getTime(); t < step1DoneAt.getTime(); t += DAY_MS) {
      if ((sendDays?.length ? sendDays : ALL_DAYS).includes(dayOfWeekInTimeZone(new Date(t), timeZone))) days += 1;
    }
    wontStart = Math.max(notStarted - Math.round(days * perDay), 0);
  }

  return {
    status: isActive ? "estimated" : "paused",
    basis,
    perDay: Math.round(perDay * 10) / 10,
    notStarted,
    sendingDaysNeeded,
    step1DoneAt,
    finishAt: lastStepAfter(step1DoneAt, steps),
    cappedByEnd,
    wontStart,
  };
}
