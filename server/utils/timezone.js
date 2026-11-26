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
