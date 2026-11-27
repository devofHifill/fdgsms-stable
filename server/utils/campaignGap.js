// campaignGap.js → the gap between two campaign texts (campaign plan C2).
//
// Each campaign sends one text, then waits its gap before the next one.
// A minimum gap in Settings (never below 5 s) applies to every campaign.
// Manual texts and AI replies are not affected.

export const GAP_UNITS = { seconds: 1000, minutes: 60 * 1000, hours: 60 * 60 * 1000 };
export const GAP_FLOOR_MS = 5000; // hard floor (Q3b)
export const DEFAULT_CAMPAIGN_GAP = { value: 30, unit: "seconds" }; // Q17
export const DEFAULT_MIN_GAP = { value: 5, unit: "seconds" }; // Q3b

export function gapToMs(gap) {
  const value = Number(gap?.value);
  const unit = GAP_UNITS[gap?.unit] ? gap.unit : "seconds";
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * GAP_UNITS[unit]);
}

// Validate user input → { gap } or { error }.
export function parseGap(input, { minMs = GAP_FLOOR_MS, label = "Gap" } = {}) {
  const unit = input?.unit ?? "seconds";
  const value = Number(input?.value);
  if (!GAP_UNITS[unit]) {
    return { error: `${label} unit must be seconds, minutes or hours` };
  }
  if (!Number.isFinite(value) || value <= 0) {
    return { error: `${label} must be a positive number` };
  }
  const gap = { value, unit };
  const ms = gapToMs(gap);
  const floor = Math.max(minMs, GAP_FLOOR_MS);
  if (ms < floor) {
    return { error: `${label} can't be shorter than ${formatGap(msToGap(floor))}` };
  }
  return { gap };
}

// Largest whole unit that represents ms (for messages / display).
export function msToGap(ms) {
  if (ms % GAP_UNITS.hours === 0) return { value: ms / GAP_UNITS.hours, unit: "hours" };
  if (ms % GAP_UNITS.minutes === 0) return { value: ms / GAP_UNITS.minutes, unit: "minutes" };
  return { value: Math.round(ms / 1000), unit: "seconds" };
}

export function formatGap(gap) {
  const value = Number(gap?.value);
  const unit = GAP_UNITS[gap?.unit] ? gap.unit : "seconds";
  const word = value === 1 ? unit.slice(0, -1) : unit;
  return `${value} ${word}`;
}

// The gap actually used: the campaign's, but never under the Settings minimum
// or the 5 s floor (e.g. after the minimum was raised).
export function effectiveGapMs(campaignGap, minGap) {
  return Math.max(gapToMs(campaignGap || DEFAULT_CAMPAIGN_GAP), gapToMs(minGap || DEFAULT_MIN_GAP), GAP_FLOOR_MS);
}

// How many campaign texts fit in the sending window per day at this gap.
export function textsPerDay(gapMs, windowHours) {
  if (!gapMs || !windowHours) return 0;
  return Math.floor((windowHours * GAP_UNITS.hours) / gapMs);
}
