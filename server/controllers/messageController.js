import Contact from "../models/Contact.js";
import SMSMessage from "../models/SMSMessage.js";
import { sendSMS, lookupPhoneNumber } from "../services/twilioService.js";
import { upsertConversation } from "../services/conversationService.js";
import { createSystemLog } from "../services/systemLogService.js";

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

    let providerResponse = null;
    let savedMessage = null;

    try {
      const lookup = await lookupPhoneNumber(contact.normalizedPhone);

      if (!lookup.isSmsCapable) {
        await createSystemLog({
          level: "warn",
          category: "sms",
          event: "manual_send_blocked_non_sms_number",
          message: `Manual SMS blocked. Number is not SMS-capable (${lookup.lineType}).`,
          contactId: contact._id,
          metadata: {
            phone: contact.normalizedPhone,
            body: text,
            lineType: lookup.lineType,
          },
        });

        return res.status(400).json({
          message: `This number is not SMS-capable. Detected type: ${lookup.lineType}`,
        });
      }

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
            from: providerResponse.from,
            to: providerResponse.to,
            accountSid: providerResponse.accountSid,
          },
          lookup: {
            lineType: lookup.lineType,
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
          lineType: lookup.lineType,
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
        },
      });

      return res.status(500).json({
        message: error.message || "Failed to send SMS",
        item: savedMessage,
      });
    }
  } catch (error) {
    console.error("sendManualMessage error:", error);

    await createSystemLog({
      level: "error",
      category: "sms",
      event: "manual_send_controller_failed",
      message: error.message || "Manual send controller failed",
      metadata: {
        contactId: req.body?.contactId || "",
      },
    });

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

    await createSystemLog({
      level: "error",
      category: "sms",
      event: "get_messages_by_contact_failed",
      message: error.message || "Failed to fetch messages by contact",
      metadata: {
        contactId: req.params?.contactId || "",
      },
    });

    return res.status(500).json({
      message: "Failed to fetch messages",
    });
  }
}