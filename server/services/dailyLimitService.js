// dailyLimitService.js → campaign plan C3.
//
// - Step-1 daily target (per campaign): keep starting new contacts until N
//   step-1 texts are DELIVERED today. Texts still waiting for a report hold a
//   place; after 15 min without a report they free it (Q6c). Undelivered ones
//   never count, so another new contact is tried instead.
// - Platform daily SMS limit (Settings, starts at 2,000): every text accepted
//   by Twilio today counts — campaign, manual and AI. When it's reached only
//   campaign texts stop (Q4b); near the limit follow-ups go first (Q4c).
// "Today" = since midnight in the account timezone.
import SMSMessage from "../models/SMSMessage.js";
import { NO_REPORT_AFTER_MS } from "./campaignDeliveryService.js";
import { startOfDayInTimeZone } from "../utils/timezone.js";

export const DEFAULT_PLATFORM_DAILY_LIMIT = 2000;
const WAITING_STATUSES = ["queued", "accepted", "sending", "sent"];

export function dayStart(now, timeZone) {
  return startOfDayInTimeZone(now, timeZone);
}

// null / empty / 0 → no limit.
export function normalizeLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function platformLimitOf(settings) {
  const raw = settings?.platformDailySmsLimit;
  return raw === undefined ? DEFAULT_PLATFORM_DAILY_LIMIT : normalizeLimit(raw);
}

// Every outbound text Twilio accepted since the start of today.
export async function countPlatformSentToday(since) {
  return SMSMessage.countDocuments({
    direction: "outbound",
    createdAt: { $gte: since },
    providerMessageSid: { $gt: "" },
  });
}

// Step-1 texts of a campaign sent today: delivered, and still waiting
// (sent < 15 min ago with no final status).
export async function countStep1Today(campaignId, firstStepNumber, since, now = new Date()) {
  const base = {
    direction: "outbound",
    campaignId,
    stepNumber: firstStepNumber,
    createdAt: { $gte: since },
  };
  const waitingSince = new Date(Math.max(now.getTime() - NO_REPORT_AFTER_MS, since.getTime()));
  const [delivered, waiting] = await Promise.all([
    SMSMessage.countDocuments({ ...base, status: "delivered" }),
    SMSMessage.countDocuments({ ...base, status: { $in: WAITING_STATUSES }, createdAt: { $gte: waitingSince } }),
  ]);
  return { delivered, waiting };
}

// How many more step-1 texts this campaign may start today (Infinity = no target).
export function step1Room(target, counts) {
  const t = normalizeLimit(target);
  if (t === null) return Infinity;
  return Math.max(t - counts.delivered - counts.waiting, 0);
}
