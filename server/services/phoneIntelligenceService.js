import { lookupPhoneNumber } from "./twilioService.js";

// Line types (normalized form) an operator can choose to allow. These match the
// values Twilio's line_type_intelligence returns after normalizeLineType().
export const SELECTABLE_LINE_TYPES = [
  "mobile",
  "landline",
  "fixed_voip",
  "non_fixed_voip",
  "toll_free",
  "unknown",
];
export const DEFAULT_ALLOWED_LINE_TYPES = ["mobile"];
const DEFAULT_CACHE_DAYS = 30;

// Accepts an array of line types (or an already-built Set) and returns a Set of
// normalized types. A non-array falls back to the default (mobile only).
function toAllowedSet(allowedLineTypes) {
  if (allowedLineTypes instanceof Set) return allowedLineTypes;
  if (!Array.isArray(allowedLineTypes)) {
    return new Set(DEFAULT_ALLOWED_LINE_TYPES);
  }
  return new Set(allowedLineTypes.map(normalizeLineType));
}

export function normalizeLineType(value) {
  return String(value || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

export function isAllowedSmsLineType(
  lineType,
  allowedLineTypes = DEFAULT_ALLOWED_LINE_TYPES
) {
  return toAllowedSet(allowedLineTypes).has(normalizeLineType(lineType));
}

function getAgeInDays(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const checkedAt = new Date(dateValue);
  if (Number.isNaN(checkedAt.getTime())) return Number.POSITIVE_INFINITY;

  return (Date.now() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);
}

export function getCachedLineTypeDecision(
  contact,
  { maxAgeDays = DEFAULT_CACHE_DAYS, allowedLineTypes = DEFAULT_ALLOWED_LINE_TYPES } = {}
) {
  const normalized = normalizeLineType(contact?.lineTypeNormalized || contact?.lineTypeRaw);
  const hasCachedType = Boolean(normalized);
  const ageDays = getAgeInDays(contact?.lineTypeCheckedAt);
  const isFresh = hasCachedType && ageDays <= maxAgeDays;
  const allowed = isAllowedSmsLineType(normalized, allowedLineTypes);

  return {
    hasCachedType,
    isFresh,
    ageDays,
    rawLineType: contact?.lineTypeRaw || "",
    normalizedLineType: normalized,
    allowed,
    source: isFresh ? "cache_fresh" : "cache_stale",
  };
}

export async function refreshContactPhoneIntelligence(
  contact,
  { allowedLineTypes = DEFAULT_ALLOWED_LINE_TYPES } = {}
) {
  const now = new Date();

  try {
    const lookup = await lookupPhoneNumber(contact.normalizedPhone);

    const rawLineType = lookup?.lineType || "";
    const normalizedLineType = normalizeLineType(rawLineType);
    const allowed = isAllowedSmsLineType(normalizedLineType, allowedLineTypes);

    contact.lineTypeRaw = rawLineType;
    contact.lineTypeNormalized = normalizedLineType;
    contact.lineTypeStatus = normalizedLineType
      ? allowed
        ? "allowed"
        : "blocked"
      : "unknown";
    contact.lineTypeCheckedAt = now;
    contact.lookupLastAttemptAt = now;
    contact.lookupLastError = "";

    await contact.save();

    return {
      ok: true,
      allowSend: allowed,
      shouldRetryLookup: false,
      source: "lookup",
      rawLineType,
      normalizedLineType,
      lineTypeStatus: contact.lineTypeStatus,
    };
  } catch (error) {
    contact.lookupLastAttemptAt = now;
    contact.lookupLastError = error.message || "Lookup failed";
    await contact.save();

    return {
      ok: false,
      allowSend: false,
      shouldRetryLookup: true,
      source: "lookup_failed",
      rawLineType: contact.lineTypeRaw || "",
      normalizedLineType: normalizeLineType(
        contact.lineTypeNormalized || contact.lineTypeRaw
      ),
      lineTypeStatus: contact.lineTypeStatus || "unknown",
      errorMessage: error.message || "Lookup failed",
    };
  }
}

export async function resolveContactSmsEligibility(
  contact,
  {
    maxAgeDays = DEFAULT_CACHE_DAYS,
    allowStaleAllowedCacheOnLookupFailure = true,
    allowedLineTypes = DEFAULT_ALLOWED_LINE_TYPES,
  } = {}
) {
  const allowedSet = toAllowedSet(allowedLineTypes);
  const cached = getCachedLineTypeDecision(contact, {
    maxAgeDays,
    allowedLineTypes: allowedSet,
  });

  if (cached.isFresh) {
    return {
      ok: true,
      allowSend: cached.allowed,
      shouldRetryLookup: false,
      source: cached.source,
      rawLineType: cached.rawLineType,
      normalizedLineType: cached.normalizedLineType,
      lineTypeStatus: cached.allowed ? "allowed" : "blocked",
      usedCache: true,
      staleCacheFallback: false,
    };
  }

  const refreshed = await refreshContactPhoneIntelligence(contact, {
    allowedLineTypes: allowedSet,
  });

  if (refreshed.ok) {
    return {
      ...refreshed,
      usedCache: false,
      staleCacheFallback: false,
    };
  }

  if (
    allowStaleAllowedCacheOnLookupFailure &&
    cached.hasCachedType &&
    cached.allowed
  ) {
    return {
      ok: true,
      allowSend: true,
      shouldRetryLookup: true,
      source: "cache_stale_fallback",
      rawLineType: cached.rawLineType,
      normalizedLineType: cached.normalizedLineType,
      lineTypeStatus: "allowed",
      usedCache: true,
      staleCacheFallback: true,
      lookupError: refreshed.errorMessage || "",
    };
  }

  return {
    ok: false,
    allowSend: false,
    shouldRetryLookup: true,
    source: "lookup_failed_no_usable_cache",
    rawLineType: cached.rawLineType,
    normalizedLineType: cached.normalizedLineType,
    lineTypeStatus: cached.hasCachedType
      ? cached.allowed
        ? "allowed"
        : "blocked"
      : "unknown",
    usedCache: false,
    staleCacheFallback: false,
    lookupError: refreshed.errorMessage || "",
  };
}