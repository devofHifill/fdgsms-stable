// messageController.js → send SMS

// Work: Handles manual outbound messages.

// Usually does:
// receive contactId + message body
// validate input
// send SMS through Twilio
// save message in database
// store Twilio SID and status
// update conversation
// In FDGSMS:

// This is the controller used when you manually send a text from the dashboard.
import Contact from "../models/Contact.js";
import SMSMessage from "../models/SMSMessage.js";
import { sendSMS } from "../services/twilioService.js";
import { upsertConversation } from "../services/conversationService.js";
import { createSystemLog } from "../services/systemLogService.js";
import { resolveContactSmsEligibility } from "../services/phoneIntelligenceService.js";

export async function sendManualMessage(req, res) {
  try {
    const { contactId, body } = req.body;

    if (!contactId) {
      return res.status(400).json({
        message: "contactId is required",
      });
    }

    if (!body || !String(body).trim()) {
      return res.status(400).json({
        message: "Message body is required",
      });
    }

    const contact = await Contact.findOne({
      _id: contactId,
      isDeleted: false,
    });

    if (!contact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    if (!contact.normalizedPhone) {
      return res.status(400).json({
        message: "Contact does not have a valid normalized phone number",
      });
    }

    const text = String(body).trim();

    const eligibility = await resolveContactSmsEligibility(contact, {
      maxAgeDays: 30,
      allowStaleAllowedCacheOnLookupFailure: true,
    });

    if (!eligibility.allowSend) {
      await createSystemLog({
        level: "warn",
        category: "sms",
        event: eligibility.shouldRetryLookup
          ? "manual_send_lookup_unavailable"
          : "manual_send_blocked_line_type",
        message: eligibility.shouldRetryLookup
          ? "Manual send blocked because lookup is unavailable and no usable cached line type exists"
          : "Manual send blocked due to disallowed line type",
        contactId: contact._id,
        metadata: {
          phone: contact.normalizedPhone,
          source: eligibility.source,
          lineType: eligibility.rawLineType,
          normalizedLineType: eligibility.normalizedLineType,
          lineTypeStatus: eligibility.lineTypeStatus || "",
          lookupError: eligibility.lookupError || "",
          staleCacheFallback: Boolean(eligibility.staleCacheFallback),
        },
      });

      return res.status(eligibility.shouldRetryLookup ? 503 : 400).json({
        message: eligibility.shouldRetryLookup
          ? "Phone verification is temporarily unavailable. Please try again shortly."
          : `This number is not eligible for SMS sending (${eligibility.normalizedLineType || "unknown"}).`,
      });
    }

    let providerResponse = null;
    let savedMessage = null;

    try {
      providerResponse = await sendSMS({
        to: contact.normalizedPhone,
        body: text,
      });

      savedMessage = await SMSMessage.create({
        contactId: contact._id,
        phone: contact.phone,
        normalizedPhone: contact.normalizedPhone,
        direction: "outbound",
        body: text,
        provider: "twilio",
        providerMessageSid: providerResponse.sid || "",
        status: providerResponse.status || "queued",
        enrollmentId: null,
        campaignId: null,
        stepNumber: null,
        messageType: "manual",
        metadata: {
          twilio: {
            from: providerResponse.from || "",
            to: providerResponse.to || "",
            accountSid: providerResponse.accountSid || "",
          },
          lookup: {
            source: eligibility.source,
            lineType: eligibility.rawLineType,
            normalizedLineType: eligibility.normalizedLineType,
            lineTypeStatus: eligibility.lineTypeStatus || "",
            staleCacheFallback: Boolean(eligibility.staleCacheFallback),
          },
        },
      });

      await createSystemLog({
        level: "info",
        category: "sms",
        event: "manual_send_success",
        message: "Manual SMS sent successfully",
        contactId: contact._id,
        metadata: {
          phone: contact.normalizedPhone,
          providerMessageSid: providerResponse.sid || "",
          status: providerResponse.status || "",
          lookupSource: eligibility.source,
          normalizedLineType: eligibility.normalizedLineType,
          lineTypeStatus: eligibility.lineTypeStatus || "",
          staleCacheFallback: Boolean(eligibility.staleCacheFallback),
        },
      });

      await upsertConversation({
        contactId: contact._id,
        normalizedPhone: contact.normalizedPhone,
        message: text,
        direction: "outbound",
      });

      return res.status(200).json({
        message: "SMS sent successfully",
        item: savedMessage,
      });
    } catch (error) {
      savedMessage = await SMSMessage.create({
        contactId: contact._id,
        phone: contact.phone,
        normalizedPhone: contact.normalizedPhone,
        direction: "outbound",
        body: text,
        provider: "twilio",
        providerMessageSid: "",
        status: "failed",
        errorCode: error.code ? String(error.code) : "",
        errorMessage: error.message || "Failed to send SMS",
        enrollmentId: null,
        campaignId: null,
        stepNumber: null,
        messageType: "manual",
        metadata: {
          providerError: {
            code: error.code || "",
            status: error.status || "",
            moreInfo: error.moreInfo || "",
          },
          lookup: {
            source: eligibility.source,
            lineType: eligibility.rawLineType,
            normalizedLineType: eligibility.normalizedLineType,
            lineTypeStatus: eligibility.lineTypeStatus || "",
            staleCacheFallback: Boolean(eligibility.staleCacheFallback),
          },
        },
      });

      await createSystemLog({
        level: "error",
        category: "sms",
        event: "manual_send_failed",
        message: error.message || "Failed to send manual SMS",
        contactId: contact._id,
        metadata: {
          phone: contact.normalizedPhone,
          body: text,
          provider: "twilio",
          errorCode: error.code || "",
          status: error.status || "",
          moreInfo: error.moreInfo || "",
          lookupSource: eligibility.source,
          normalizedLineType: eligibility.normalizedLineType,
          lineTypeStatus: eligibility.lineTypeStatus || "",
          staleCacheFallback: Boolean(eligibility.staleCacheFallback),
        },
      });

      return res.status(500).json({
        message: error.message || "Failed to send SMS",
        item: savedMessage,
      });
    }
  } catch (error) {
    console.error("sendManualMessage error:", error);

    try {
      await createSystemLog({
        level: "error",
        category: "sms",
        event: "manual_send_controller_failed",
        message: error.message || "Manual send controller failed",
        metadata: {
          contactId: req.body?.contactId || "",
        },
      });
    } catch (logError) {
      console.error("manual_send_controller_failed log error:", logError);
    }

    return res.status(500).json({
      message: "Internal server error while sending message",
    });
  }
}

export async function getMessagesByContact(req, res) {
  try {
    const { contactId } = req.params;

    const contact = await Contact.findOne({
      _id: contactId,
      isDeleted: false,
    }).lean();

    if (!contact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    const items = await SMSMessage.find({ contactId })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      contact: {
        _id: contact._id,
        fullName: contact.fullName,
        phone: contact.phone,
        normalizedPhone: contact.normalizedPhone,
      },
      items,
    });
  } catch (error) {
    console.error("getMessagesByContact error:", error);

    try {
      await createSystemLog({
        level: "error",
        category: "sms",
        event: "get_messages_by_contact_failed",
        message: error.message || "Failed to fetch messages by contact",
        metadata: {
          contactId: req.params?.contactId || "",
        },
      });
    } catch (logError) {
      console.error("get_messages_by_contact_failed log error:", logError);
    }

    return res.status(500).json({
      message: "Failed to fetch messages",
    });
  }
}