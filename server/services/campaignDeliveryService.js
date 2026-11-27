// campaignDeliveryService.js → campaign plan C1.
//
// What a campaign does with each text's final delivery status:
// - Delivered  → the contact's next step becomes due its delay AFTER the
//                delivery time (Q2); the campaign's "undelivered in a row"
//                counter goes back to 0.
// - Undelivered / failed (any error code, Q7) → the contact gets no more steps
//                in this campaign, the number goes on the do-not-text list for
//                all future campaigns, and the counter goes up; at the Settings
//                limit the campaign pauses itself until you resume it (Q7b/c).
// - No report  → the next step stays on hold; a late "delivered" within 24 h
//                lets the contact carry on, otherwise their remaining steps are
//                cancelled and the number is NOT listed (Q6b).
import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Enrollment from "../models/Enrollment.js";
import SMSMessage from "../models/SMSMessage.js";
import AutomationSettings from "../models/AutomationSettings.js";
import { addToDoNotText } from "./doNotTextService.js";
import { createSystemLog } from "./systemLogService.js";

export const NO_REPORT_AFTER_MS = 15 * 60 * 1000; // Q6c
export const LATE_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000; // Q6b
export const DEFAULT_AUTO_PAUSE_AFTER = 10; // Q7b

// Errors Twilio gives at SEND time that mean the number itself is the problem.
// Other send-time errors (auth, config, network) are retried as before.
export const RECIPIENT_SEND_ERROR_CODES = new Set(["21211", "21610", "21612", "21614"]);

const FAILED = new Set(["undelivered", "failed"]);

export function isFinalFailure(status) {
  return FAILED.has(status);
}

export function nextSendAfterDelivery(deliveredAt, delayMs) {
  return new Date(new Date(deliveredAt).getTime() + Math.max(Number(delayMs) || 0, 0));
}

// ---- auto-pause --------------------------------------------------------

export async function getAutoPauseSettings() {
  const s = await AutomationSettings.findOne({ key: "default" }).lean();
  const enabled = s?.autoPause?.enabled !== false;
  const after = Math.max(Number(s?.autoPause?.afterUndeliveredInARow) || DEFAULT_AUTO_PAUSE_AFTER, 1);
  return { enabled, after };
}

export async function resetUndeliveredRun(campaignId) {
  if (!campaignId) return;
  await Campaign.updateOne(
    { _id: campaignId, consecutiveUndelivered: { $ne: 0 } },
    { $set: { consecutiveUndelivered: 0 } }
  );
}

// +1 to the run; pauses the campaign when the run reaches the limit.
// Returns { count, paused }.
export async function countUndelivered(campaignId, lastErrorText = "") {
  if (!campaignId) return { count: 0, paused: false };

  const campaign = await Campaign.findOneAndUpdate(
    { _id: campaignId },
    { $inc: { consecutiveUndelivered: 1 } },
    { returnDocument: "after" }
  ).lean();
  if (!campaign) return { count: 0, paused: false };

  const count = campaign.consecutiveUndelivered;
  const { enabled, after } = await getAutoPauseSettings();
  if (!enabled || count < after) return { count, paused: false };

  const reason = `Paused automatically: ${count} undelivered in a row${lastErrorText ? ` (last: ${lastErrorText})` : ""}. Fix the cause, then resume.`;
  const pause = await Campaign.updateOne(
    { _id: campaignId, isActive: true },
    { $set: { isActive: false, pausedReason: reason, autoPausedAt: new Date() } }
  );
  const paused = Boolean(pause.modifiedCount);

  if (paused) {
    await createSystemLog({
      level: "warn",
      category: "automation",
      event: "campaign_auto_paused",
      message: reason,
      campaignId,
      metadata: { consecutiveUndelivered: count, limit: after },
    });
  }
  return { count, paused };
}

// ---- per-enrollment outcomes (idempotent) --------------------------------

// Delivered: if this enrollment was waiting for exactly this text, schedule
// its next step from the delivery time.
export async function releaseAfterDelivery(message, deliveredAt) {
  if (!message?.enrollmentId) return false;

  const enrollment = await Enrollment.findOne({
    _id: message.enrollmentId,
    status: "active",
    "awaitingDelivery.messageId": message._id,
  }).lean();
  if (!enrollment) return false;

  const nextSendAt = nextSendAfterDelivery(deliveredAt, enrollment.awaitingDelivery?.delayMs);
  const result = await Enrollment.updateOne(
    { _id: enrollment._id, status: "active", "awaitingDelivery.messageId": message._id },
    {
      $set: {
        nextSendAt,
        lastDeliveredAt: deliveredAt,
        "awaitingDelivery.messageId": null,
        "awaitingDelivery.stepNumber": null,
        "awaitingDelivery.sentAt": null,
        "awaitingDelivery.delayMs": null,
      },
    }
  );
  return Boolean(result.modifiedCount);
}

// Undelivered / failed: no more steps for this contact in this campaign, and
// the number goes on the do-not-text list. Returns true if the enrollment
// was stopped now.
export async function excludeAfterFailure(message, error) {
  const code = error?.code || "";
  const text = error?.message || (code ? `Twilio error ${code}` : "Undelivered");

  await addToDoNotText({
    normalizedPhone: message.normalizedPhone,
    errorCode: code,
    errorMessage: text,
    contactId: message.contactId,
    campaignId: message.campaignId,
    messageId: message._id,
    stepNumber: message.stepNumber ?? null,
  });

  if (error?.contactInvalid) {
    await Contact.updateOne(
      { _id: message.contactId, status: { $ne: "opted_out" } },
      { $set: { status: "invalid" } }
    );
  }

  if (!message.enrollmentId) return false;
  const step = message.stepNumber ?? "?";
  const result = await Enrollment.updateOne(
    { _id: message.enrollmentId, status: "active" },
    {
      $set: {
        status: "stopped",
        stopReason: `undelivered_step_${step}`,
        lastError: text,
        nextSendAt: null,
        "awaitingDelivery.messageId": null,
        "awaitingDelivery.stepNumber": null,
        "awaitingDelivery.sentAt": null,
        "awaitingDelivery.delayMs": null,
      },
    }
  );
  return Boolean(result.modifiedCount);
}

// Entry point for the status webhook (first time a final status arrives).
export async function onCampaignDeliveryStatus(message, status, error, at = new Date()) {
  if (!message?.campaignId) return { handled: false };

  if (status === "delivered") {
    await resetUndeliveredRun(message.campaignId);
    const released = await releaseAfterDelivery(message, at);
    return { handled: true, released };
  }

  if (isFinalFailure(status)) {
    const excluded = await excludeAfterFailure(message, error);
    const run = await countUndelivered(message.campaignId, error?.message || error?.code || "");
    return { handled: true, excluded, ...run };
  }

  return { handled: false };
}

// ---- sweep (runs every automation cycle, outside the sending window too) --

// Catches statuses that arrived before the enrollment started waiting (a race
// between the send and a very fast webhook) and applies the 24 h cut-off.
export async function reconcileAwaitingEnrollments(now = new Date()) {
  const waiting = await Enrollment.find({
    status: "active",
    "awaitingDelivery.messageId": { $ne: null },
  })
    .select("_id awaitingDelivery")
    .lean();
  if (!waiting.length) return { released: 0, excluded: 0, expired: 0 };

  const messages = await SMSMessage.find({
    _id: { $in: waiting.map((e) => e.awaitingDelivery.messageId) },
  }).lean();
  const byId = new Map(messages.map((m) => [String(m._id), m]));

  let released = 0;
  let excluded = 0;
  let expired = 0;

  for (const enrollment of waiting) {
    const message = byId.get(String(enrollment.awaitingDelivery.messageId));

    if (message?.status === "delivered") {
      const at = message.metadata?.deliveredAt || message.updatedAt || now;
      if (await releaseAfterDelivery(message, at)) released += 1;
      continue;
    }

    if (message && isFinalFailure(message.status)) {
      const error = { code: message.errorCode, message: message.errorMessage };
      if (await excludeAfterFailure(message, error)) excluded += 1;
      continue;
    }

    const sentAt = new Date(enrollment.awaitingDelivery.sentAt || 0).getTime();
    if (now.getTime() - sentAt >= LATE_REPORT_WINDOW_MS) {
      const result = await Enrollment.updateOne(
        { _id: enrollment._id, status: "active", "awaitingDelivery.messageId": enrollment.awaitingDelivery.messageId },
        {
          $set: {
            status: "stopped",
            stopReason: "no_delivery_report",
            lastError: "No delivery report from the carrier within 24 hours",
            nextSendAt: null,
          },
        }
      );
      if (result.modifiedCount) expired += 1;
    }
  }

  if (expired) {
    await createSystemLog({
      level: "info",
      category: "automation",
      event: "campaign_steps_cancelled_no_report",
      message: `${expired} contact(s) stopped: no delivery report within 24 hours (not added to the do-not-text list)`,
      metadata: { expired },
    });
  }

  return { released, excluded, expired };
}
