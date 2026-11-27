// Account timezone choices (Settings page) and how to show them.
export const DEFAULT_TIMEZONE = "America/New_York";

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix, no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "UTC", label: "UTC" },
];

// Fired by the Settings page after a save, so the on-screen clock follows.
export const SETTINGS_SAVED_EVENT = "fdgsms:settings-saved";

export function timezoneLabel(timeZone) {
  return TIMEZONE_OPTIONS.find((o) => o.value === timeZone)?.label || timeZone;
}

function format(date, timeZone, options) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
  } catch {
    return "";
  }
}

// "Fri 5:40 AM"
export function clockText(date, timeZone) {
  return format(date, timeZone, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// "EST" / "EDT" / "UTC"
export function zoneAbbreviation(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

// Used by the Settings page hint: "Thu 3:11 AM"
export function timeNowIn(timeZone) {
  return clockText(new Date(), timeZone);
}
