import { lookupPhoneNumber } from "./twilioService.js";

const ALLOWED_LINE_TYPES = new Set(["mobile", "fixed_voip"]);
const DEFAULT_CACHE_DAYS = 30;

export function normalizeLineType(value) {
  return String(value || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

export function isAllowedSmsLineType(lineType) {
  return ALLOWED_LINE_TYPES.has(normalizeLineType(lineType));
}

function getAgeInDays(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const checkedAt = new Date(dateValue);
  if (Number.isNaN(checkedAt.getTime())) return Number.POSITIVE_INFINITY;

  return (Date.now() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);
}

export function getCachedLineTypeDecision(contact, { maxAgeDays = DEFAULT_CACHE_DAYS } = {}) {
  const normalized = normalizeLineType(contact?.lineTypeNormalized || contact?.lineTypeRaw);
  const hasCachedType = Boolean(normalized);
  const ageDays = getAgeInDays(contact?.lineTypeCheckedAt);
  const isFresh = hasCachedType && ageDays <= maxAgeDays;
  const allowed = isAllowedSmsLineType(normalized);

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

export async function refreshContactPhoneIntelligence(contact) {
  const now = new Date();

  try {
    const lookup = await lookupPhoneNumber(contact.normalizedPhone);

    const rawLineType = lookup?.lineType || "";
    const normalizedLineType = normalizeLineType(rawLineType);
    const allowed = isAllowedSmsLineType(normalizedLineType);

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
  } = {}
) {
  const cached = getCachedLineTypeDecision(contact, { maxAgeDays });

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

  const refreshed = await refreshContactPhoneIntelligence(contact);

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