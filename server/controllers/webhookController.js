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
import { createSystemLog } from "../services/systemLogService.js";

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

    const inboundMessage = await SMSMessage.create({
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

    await Conversation.findOneAndUpdate(
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
      },
      {
        new: true,
        upsert: true,
      }
    );

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