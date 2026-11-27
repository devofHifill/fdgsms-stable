// webhookController.js → handle inbound SMS

// Work: Receives messages from Twilio webhooks.

// Usually does:
// receive inbound SMS from Twilio
// read From, To, Body, MessageSid
// find matching contact
// save inbound message
// update conversation
// mark contact/conversation as replied
// stop automation if needed
// In FDGSMS:

// This is what makes your platform two-way, so replies from users come into your system.

import Contact from "../models/Contact.js";
import SMSMessage from "../models/SMSMessage.js";
import Conversation from "../models/Conversation.js";
import Enrollment from "../models/Enrollment.js";
import { normalizePhone, isValidNormalizedPhone } from "../utils/phone.js";
import {
  classifyInboundKeyword,
  applyOptOut,
  applyOptIn,
  isOptInRequest,
} from "../utils/optOut.js";
import { maybeEnqueueAiReply } from "../services/aiReplyService.js";
import { createSystemLog } from "../services/systemLogService.js";
import { describeTwilioError, shouldApplyStatus } from "../utils/twilioErrors.js";
import { onCampaignDeliveryStatus } from "../services/campaignDeliveryService.js";

const DUPLICATE_KEY = 11000;

// Twilio retries a webhook it thinks failed (timeout, 5xx) with the SAME
// MessageSid. Processing it again would duplicate the message in the inbox,
// stop/opt-out twice and queue a second AI reply.
async function isDuplicateInbound(messageSid) {
  if (!messageSid) return false;
  return Boolean(
    await SMSMessage.exists({ direction: "inbound", providerMessageSid: messageSid })
  );
}

async function logDuplicateInbound(messageSid, from) {
  await createSystemLog({
    level: "info",
    category: "webhook",
    event: "inbound_sms_duplicate",
    message: "Duplicate inbound SMS ignored (Twilio retry)",
    metadata: { messageSid, from },
  });
}

export async function handleInboundSMS(req, res) {
  try {
    const { From, To, Body, MessageSid } = req.body;

    if (!From || !Body) {
      await createSystemLog({
        level: "warn",
        category: "webhook",
        event: "inbound_sms_missing_fields",
        message: "Inbound SMS missing required fields",
        metadata: {
          body: req.body,
        },
      });

      return res.status(200).send("OK");
    }

    if (await isDuplicateInbound(MessageSid)) {
      await logDuplicateInbound(MessageSid, From);
      return res.status(200).send("OK");
    }

    const normalizedFrom = normalizePhone(From);

    if (!normalizedFrom || !isValidNormalizedPhone(normalizedFrom)) {
      await createSystemLog({
        level: "warn",
        category: "webhook",
        event: "inbound_sms_invalid_phone",
        message: "Inbound SMS received with invalid phone number",
        metadata: {
          from: From,
          normalizedFrom,
        },
      });

      return res.status(200).send("OK");
    }

    const contact = await Contact.findOne({
      normalizedPhone: normalizedFrom,
      isDeleted: false,
    });

    if (!contact) {
      await createSystemLog({
        level: "warn",
        category: "webhook",
        event: "inbound_sms_unknown_contact",
        message: "Inbound SMS received from unknown number",
        metadata: {
          from: From,
          normalizedFrom,
          to: To,
          body: Body,
          messageSid: MessageSid || "",
        },
      });

      return res.status(200).send("OK");
    }

    let inboundMessage;
    try {
      inboundMessage = await SMSMessage.create({
        contactId: contact._id,
        phone: contact.phone,
        normalizedPhone: contact.normalizedPhone,
        direction: "inbound",
        body: Body,
        provider: "twilio",
        providerMessageSid: MessageSid || "",
        status: "received",
        enrollmentId: null,
        campaignId: null,
        stepNumber: null,
        messageType: "inbound",
        metadata: {
          from: From,
          to: To,
        },
      });
    } catch (createError) {
      // Two deliveries of the same text racing each other: the unique index
      // on inbound providerMessageSid lets only one through.
      if (createError?.code === DUPLICATE_KEY) {
        await logDuplicateInbound(MessageSid, From);
        return res.status(200).send("OK");
      }
      throw createError;
    }

    const conversation = await Conversation.findOneAndUpdate(
      { contactId: contact._id },
      {
        $set: {
          contactId: contact._id,
          phone: contact.phone,
          normalizedPhone: contact.normalizedPhone,
          lastMessage: inboundMessage.body,
          lastDirection: "inbound",
          lastMessageAt: inboundMessage.createdAt,
          status: "replied",
        },
        $inc: { unreadCount: 1 },
      },
      {
        new: true,
        upsert: true,
      }
    );

    // 🛑 Compliance keywords take precedence over normal reply handling.
    // The app sends no confirmation reply — carrier-level Advanced Opt-Out
    // handles the legally required STOP/START responses.
    const keyword = classifyInboundKeyword(Body);

    if (keyword === "stop") {
      const { stoppedEnrollments } = await applyOptOut(contact);

      await createSystemLog({
        level: "info",
        category: "webhook",
        event: "inbound_sms_opt_out",
        message: "Contact opted out via STOP keyword",
        contactId: contact._id,
        metadata: {
          from: From,
          to: To,
          messageSid: MessageSid || "",
          stoppedEnrollments,
        },
      });

      return res.status(200).send("OK");
    }

    // START/YES only re-subscribes a contact who is opted out. For an active
    // contact it is an ordinary reply and falls through to the handling below.
    if (isOptInRequest(keyword, contact)) {
      await applyOptIn(contact);

      await createSystemLog({
        level: "info",
        category: "webhook",
        event: "inbound_sms_opt_in",
        message: "Contact opted back in via START keyword",
        contactId: contact._id,
        metadata: {
          from: From,
          to: To,
          messageSid: MessageSid || "",
        },
      });

      return res.status(200).send("OK");
    }

    await Contact.findByIdAndUpdate(contact._id, {
      $set: {
        status: "replied",
      },
    });

    const stopResult = await Enrollment.updateMany(
      {
        contactId: contact._id,
        status: "active",
      },
      {
        $set: {
          status: "stopped",
          stopReason: "replied",
          replyDetectedAt: new Date(),
          nextSendAt: null,
        },
      }
    );

    await createSystemLog({
      level: "info",
      category: "webhook",
      event: "inbound_sms_processed",
      message: "Inbound SMS processed successfully",
      contactId: contact._id,
      metadata: {
        from: From,
        to: To,
        messageSid: MessageSid || "",
        bodyLength: Body?.length || 0,
        stoppedEnrollments:
          stopResult.modifiedCount ??
          stopResult.nModified ??
          0,
      },
    });

    // 🤖 AI Reply — enqueue a job if eligible. Isolated so a failure here never
    // affects the fast 200 or the rest of inbound processing. The LLM is never
    // called here; the worker (Phase 4) picks up the job.
    try {
      const aiResult = await maybeEnqueueAiReply({
        contact,
        conversation,
        inboundMessage,
        toNumber: To,
      });

      if (aiResult.created) {
        await createSystemLog({
          level: "info",
          category: "ai",
          event: "ai_reply_enqueued",
          message: "AI reply job enqueued for inbound message",
          contactId: contact._id,
          metadata: {
            jobId: String(aiResult.jobId),
            inboundMessageId: String(inboundMessage._id),
          },
        });
      }
    } catch (aiError) {
      await createSystemLog({
        level: "error",
        category: "ai",
        event: "ai_reply_enqueue_failed",
        message: aiError.message || "Failed to enqueue AI reply job",
        contactId: contact._id,
        metadata: {
          inboundMessageId: String(inboundMessage._id),
        },
      });
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Inbound SMS webhook error:", error);

    await createSystemLog({
      level: "error",
      category: "webhook",
      event: "inbound_sms_failed",
      message: error.message || "Inbound webhook processing failed",
      metadata: {
        body: req.body || {},
      },
    });

    return res.status(200).send("OK");
  }
}

// Twilio delivery-status callback — updates the stored message's status by SID.
// Configure this URL as the statusCallback on your Twilio sender/messaging service.
const STATUS_VALUES = new Set([
  "queued",
  "accepted",
  "sending",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "received",
]);

// A delivery error that means the number itself can't take our texts: stop
// that contact's campaigns (and mark a dead number invalid) so we don't keep
// paying to send to it. Temporary errors (30003, 30007, …) are only recorded.
async function handlePermanentDeliveryFailure(message, error) {
  const stop = await Enrollment.updateMany(
    { contactId: message.contactId, status: "active" },
    {
      $set: {
        status: "stopped",
        stopReason: `undeliverable_${error.code}`,
        lastError: error.message,
        nextSendAt: null,
      },
    }
  );

  if (error.contactInvalid) {
    await Contact.updateOne(
      { _id: message.contactId, status: { $ne: "opted_out" } },
      { $set: { status: "invalid" } }
    );
  }

  return stop.modifiedCount ?? stop.nModified ?? 0;
}

export async function handleStatusCallback(req, res) {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;

    if (!MessageSid) {
      return res.status(200).send("OK");
    }

    const message = await SMSMessage.findOne({ providerMessageSid: MessageSid });
    if (!message) {
      return res.status(200).send("OK");
    }

    const update = {};
    if (
      MessageStatus &&
      STATUS_VALUES.has(MessageStatus) &&
      shouldApplyStatus(message.status, MessageStatus)
    ) {
      update.status = MessageStatus;
    }

    const isFailure = MessageStatus === "undelivered" || MessageStatus === "failed";
    const error =
      describeTwilioError(ErrorCode) ||
      (isFailure
        ? { code: "", label: "No error code", permanent: false, contactInvalid: false, message: `SMS ${MessageStatus} (no error code from Twilio)` }
        : null);
    if (error) {
      update.errorCode = error.code;
      update.errorMessage = error.message;
      update["metadata.deliveryError"] = {
        code: error.code,
        permanent: error.permanent,
      };
    }

    const now = new Date();
    const firstDelivered = MessageStatus === "delivered" && message.status !== "delivered";
    // First time we hear about a failure (Twilio can resend callbacks).
    const firstFailure =
      isFailure && update.status === MessageStatus && !["undelivered", "failed"].includes(message.status);
    if (firstDelivered && update.status === "delivered") {
      update["metadata.deliveredAt"] = now;
    }

    if (Object.keys(update).length) {
      await SMSMessage.updateOne({ _id: message._id }, { $set: update });
    }

    // Campaign texts: delivered → next step scheduled from now; undelivered /
    // failed → contact excluded, number on the do-not-text list, run counter
    // (campaign plan C1).
    let campaignOutcome = null;
    if (message.campaignId && (firstDelivered || firstFailure)) {
      campaignOutcome = await onCampaignDeliveryStatus(
        message,
        firstDelivered ? "delivered" : MessageStatus,
        error,
        now
      );
    }

    if (firstFailure) {
      // Non-campaign texts keep the earlier rule: permanent errors stop the
      // contact's campaigns and dead numbers are marked invalid.
      const stoppedEnrollments =
        !message.campaignId && error.permanent
          ? await handlePermanentDeliveryFailure(message, error)
          : campaignOutcome?.excluded
            ? 1
            : 0;

      await createSystemLog({
        level: error.permanent ? "warn" : "error",
        category: "sms",
        event: "sms_delivery_failed",
        message: `SMS ${MessageStatus}: ${error.message}`,
        contactId: message.contactId,
        enrollmentId: message.enrollmentId || null,
        campaignId: message.campaignId || null,
        metadata: {
          messageSid: MessageSid,
          errorCode: error.code,
          permanent: error.permanent,
          contactMarkedInvalid: Boolean(error.permanent && error.contactInvalid),
          stoppedEnrollments,
          addedToDoNotText: Boolean(message.campaignId),
          campaignUndeliveredInARow: campaignOutcome?.count ?? null,
          campaignAutoPaused: Boolean(campaignOutcome?.paused),
        },
      });
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Status callback error:", error);
    return res.status(200).send("OK");
  }
}