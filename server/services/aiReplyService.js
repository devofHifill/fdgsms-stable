// aiReplyService.js → AI reply eligibility + job enqueue (Phase 2)
//
// Decides whether an inbound SMS should get an AI reply and, if so, creates an
// AiReplyJob for the worker (Phase 4) to process. This is the layered control
// gate: AI replies only if global ON and the contact allows and no human has
// taken over. It never calls the LLM — that happens in the worker — so the
// inbound webhook stays fast.

import AiSettings from "../models/AiSettings.js";
import AiReplyJob from "../models/AiReplyJob.js";

// Load (or lazily create) the single global AI settings document.
// Same pattern as getAutomationSettings().
export async function getAiSettings() {
  let settings = await AiSettings.findOne({ key: "default" });

  if (!settings) {
    settings = await AiSettings.create({ key: "default" });
  }

  return settings;
}

// Resolve the effective AI on/off for a contact (layer 2, tri-state).
export function resolveContactAiEnabled(contact, settings) {
  const mode = contact?.aiMode || "default";

  if (mode === "forced_on") return true;
  if (mode === "forced_off") return false;

  // "default" defers to the global default for new/unset contacts.
  return Boolean(settings?.defaultContactAiEnabled);
}

// Evaluate all enqueue-time gates. Pure function → easy to unit test.
// Returns { eligible: boolean, reason: string }.
export function evaluateInboundAiEligibility({
  contact,
  conversation,
  settings,
  toNumber,
}) {
  // Layer 1 — global switch.
  if (!settings?.enabled) {
    return { eligible: false, reason: "ai_disabled_global" };
  }
  if (settings.replyMode === "off") {
    return { eligible: false, reason: "reply_mode_off" };
  }

  // Compliance — never AI-reply to an opted-out contact.
  if (contact?.optedOut) {
    return { eligible: false, reason: "contact_opted_out" };
  }

  // Layer 2 — contact AI mode.
  if (!resolveContactAiEnabled(contact, settings)) {
    return { eligible: false, reason: "contact_ai_off" };
  }

  // Layer 3 — a human owns this conversation.
  if (conversation?.humanTakeover?.active) {
    return { eligible: false, reason: "human_takeover" };
  }

  // Only answer on configured Twilio numbers (empty list = answer on all).
  const activeNumbers = settings.activePhoneNumbers || [];
  if (activeNumbers.length && toNumber && !activeNumbers.includes(toNumber)) {
    return { eligible: false, reason: "inactive_number" };
  }

  return { eligible: true, reason: "eligible" };
}

// Create an AiReplyJob for an inbound message if it is eligible and one is not
// already queued for the contact. Returns a result object for logging.
export async function maybeEnqueueAiReply({
  contact,
  conversation,
  inboundMessage,
  toNumber,
}) {
  const settings = await getAiSettings();

  const { eligible, reason } = evaluateInboundAiEligibility({
    contact,
    conversation,
    settings,
    toNumber,
  });

  if (!eligible) {
    return { created: false, reason };
  }

  // Dedup — don't stack jobs while one is still awaiting/processing for this
  // contact (prevents pile-ups and double-texting at the job level).
  const existing = await AiReplyJob.findOne({
    contactId: contact._id,
    status: { $in: ["pending", "processing"] },
  })
    .select("_id")
    .lean();

  if (existing) {
    return { created: false, reason: "job_already_pending", jobId: existing._id };
  }

  const job = await AiReplyJob.create({
    contactId: contact._id,
    conversationId: conversation?._id || null,
    inboundMessageId: inboundMessage._id,
    status: "pending",
  });

  return { created: true, reason: "enqueued", jobId: job._id };
}
