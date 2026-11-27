// timezone.js → account timezone helpers for the campaign sending window.
//
// The server clock is UTC in Docker, so "9 to 18" must be read in the
// account's own timezone, not the server's.

export const DEFAULT_TIMEZONE = "America/New_York";

// True for any IANA zone the runtime knows (e.g. "America/Chicago", "UTC").
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Wall-clock parts of `date` in `timeZone`.
function wallParts(date, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

// Campaign plan C3: the moment today began (midnight) in the account
// timezone, as a real Date. Daily targets and the platform limit reset then.
export function startOfDayInTimeZone(date, timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const w = wallParts(date, zone);
  // Offset between the zone's wall clock and UTC right now (DST-aware).
  const wallAsUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  const offsetMs = wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
  return new Date(Date.UTC(w.y, w.m - 1, w.d, 0, 0, 0) - offsetMs);
}

// Campaign plan C4: "2026-12-03" + "09:00" typed in the account timezone →
// the real moment (Date). DST-aware; a time that doesn't exist on a
// spring-forward day lands an hour later. Returns null for bad input.
export function zonedDateTimeToDate(dateStr, timeStr = "00:00", timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || "00:00").trim());
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const target = Date.UTC(y, mo - 1, d, h, mi, 0);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const w = wallParts(new Date(guess), zone);
    const wallAsUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
    guess += target - wallAsUtc;
  }
  return new Date(guess);
}

// Day of the week (0 = Sunday … 6 = Saturday) at `date` in `timeZone`.
export function dayOfWeekInTimeZone(date, timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const w = wallParts(date, zone);
  return new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
}

// Hour of the day (0–23) at `date` in `timeZone`. Falls back to the default
// zone if the stored value is invalid.
export function getHourInTimeZone(date, timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(hour) % 24;
}

// Is `now` inside [startHour, endHour) in `timeZone`? A window that wraps
// midnight (e.g. 20 → 6) works; start === end or bad hours mean "always".
export function isWithinSendingWindow(now, sendingWindow, timeZone) {
  const startHour = Number(sendingWindow?.startHour ?? 9);
  const endHour = Number(sendingWindow?.endHour ?? 18);

  if (
    Number.isNaN(startHour) ||
    Number.isNaN(endHour) ||
    startHour < 0 ||
    startHour > 23 ||
    endHour < 0 ||
    endHour > 23
  ) {
    return true;
  }

  if (startHour === endHour) {
    return true;
  }

  const currentHour = getHourInTimeZone(now, timeZone);

  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }

  return currentHour >= startHour || currentHour < endHour;
}
