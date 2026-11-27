// doNotTextService.js → read / write the do-not-text list and apply the
// Settings choice for manual texts and AI replies (campaign plan C1, Q8).
import SuppressedNumber from "../models/SuppressedNumber.js";
import AutomationSettings from "../models/AutomationSettings.js";
import { createSystemLog } from "./systemLogService.js";

export const DNT_POLICIES = ["block", "warn"];

export async function findDoNotText(normalizedPhone) {
  if (!normalizedPhone) return null;
  return SuppressedNumber.findOne({ normalizedPhone }).lean();
}

// Which of these numbers are on the list → Map(phone → entry).
export async function findDoNotTextMany(phones) {
  const list = [...new Set((phones || []).filter(Boolean))];
  if (!list.length) return new Map();
  const rows = await SuppressedNumber.find({ normalizedPhone: { $in: list } }).lean();
  return new Map(rows.map((row) => [row.normalizedPhone, row]));
}

// Add a number (idempotent: the first failure is kept as the reason).
export async function addToDoNotText({
  normalizedPhone,
  errorCode = "",
  errorMessage = "",
  contactId = null,
  campaignId = null,
  messageId = null,
  stepNumber = null,
  reason = "undelivered",
}) {
  if (!normalizedPhone) return { added: false };

  const result = await SuppressedNumber.updateOne(
    { normalizedPhone },
    {
      $setOnInsert: {
        normalizedPhone,
        reason,
        errorCode: String(errorCode || ""),
        errorMessage,
        contactId,
        campaignId,
        messageId,
        stepNumber,
      },
    },
    { upsert: true }
  );

  const added = Boolean(result.upsertedCount);
  if (added) {
    await createSystemLog({
      level: "warn",
      category: "sms",
      event: "do_not_text_added",
      message: `Added to do-not-text list: ${errorMessage || errorCode || reason}`,
      contactId,
      campaignId,
      metadata: { phone: normalizedPhone, errorCode, stepNumber },
    });
  }
  return { added };
}

export async function removeFromDoNotText(normalizedPhone, { contactId = null, by = "" } = {}) {
  const removed = await SuppressedNumber.findOneAndDelete({ normalizedPhone }).lean();
  if (removed) {
    await createSystemLog({
      level: "info",
      category: "sms",
      event: "do_not_text_removed",
      message: "Removed from do-not-text list by hand",
      contactId: contactId || removed.contactId || null,
      metadata: {
        phone: normalizedPhone,
        by,
        originalErrorCode: removed.errorCode,
        listedAt: removed.createdAt,
      },
    });
  }
  return removed;
}

export async function getDoNotTextPolicy() {
  const settings = await AutomationSettings.findOne({ key: "default" }).lean();
  const p = settings?.doNotTextList || {};
  return {
    manual: DNT_POLICIES.includes(p.manual) ? p.manual : "warn",
    ai: DNT_POLICIES.includes(p.ai) ? p.ai : "warn",
  };
}

export function describeListing(entry) {
  if (!entry) return "";
  const when = entry.createdAt ? new Date(entry.createdAt).toISOString().slice(0, 10) : "";
  const why = entry.errorCode || entry.reason || "undelivered";
  return `This number is on the do-not-text list (undelivered ${when}, ${why}).`;
}

// For manual texts / AI replies: { blocked, warning, entry }.
export async function checkDoNotText(normalizedPhone, kind /* "manual" | "ai" */) {
  const entry = await findDoNotText(normalizedPhone);
  if (!entry) return { blocked: false, warning: "", entry: null };
  const policy = await getDoNotTextPolicy();
  const mode = policy[kind] || "warn";
  return { blocked: mode === "block", warning: describeListing(entry), entry };
}
