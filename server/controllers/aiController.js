// aiController.js → per-contact AI mode, human takeover, and draft review.

import mongoose from "mongoose";
import Contact from "../models/Contact.js";
import Conversation from "../models/Conversation.js";
import SMSMessage from "../models/SMSMessage.js";
import AiReplyJob from "../models/AiReplyJob.js";
import { sendSMS } from "../services/twilioService.js";
import { upsertConversation } from "../services/conversationService.js";
import { createSystemLog } from "../services/systemLogService.js";

const AI_MODES = ["default", "forced_on", "forced_off"];

function agentLabel(req) {
  return req.user?.email || req.user?.name || "admin";
}

// PATCH /contacts/:contactId/ai-mode  { aiMode }
export async function setContactAiMode(req, res) {
  try {
    const { contactId } = req.params;
    const { aiMode } = req.body || {};

    if (!mongoose.isValidObjectId(contactId)) {
      return res.status(400).json({ message: "Invalid contact id" });
    }
    if (!AI_MODES.includes(aiMode)) {
      return res.status(400).json({ message: `aiMode must be one of ${AI_MODES.join(", ")}` });
    }

    const contact = await Contact.findOneAndUpdate(
      { _id: contactId, isDeleted: false },
      { $set: { aiMode } },
      { new: true }
    ).lean();

    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    await createSystemLog({
      level: "info",
      category: "ai",
      event: "contact_ai_mode_set",
      message: `Contact AI mode set to ${aiMode}`,
      contactId: contact._id,
      metadata: { aiMode, by: agentLabel(req) },
    });

    return res.status(200).json({ message: "AI mode updated", item: contact });
  } catch (error) {
    console.error("setContactAiMode error:", error);
    return res.status(500).json({ message: "Failed to update AI mode" });
  }
}

// POST /conversations/:contactId/takeover
export async function claimTakeover(req, res) {
  try {
    const { contactId } = req.params;
    if (!mongoose.isValidObjectId(contactId)) {
      return res.status(400).json({ message: "Invalid contact id" });
    }

    const conversation = await Conversation.findOneAndUpdate(
      { contactId },
      {
        $set: {
          "humanTakeover.active": true,
          "humanTakeover.agentName": agentLabel(req),
          "humanTakeover.claimedAt": new Date(),
          "humanTakeover.releasedAt": null,
        },
      },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    await createSystemLog({
      level: "info",
      category: "ai",
      event: "human_takeover_started",
      message: "Human took over conversation",
      contactId,
      metadata: { by: agentLabel(req) },
    });

    return res.status(200).json({ message: "Conversation taken over", item: conversation });
  } catch (error) {
    console.error("claimTakeover error:", error);
    return res.status(500).json({ message: "Failed to take over conversation" });
  }
}

// POST /conversations/:contactId/release  { keepAiOff }
export async function releaseTakeover(req, res) {
  try {
    const { contactId } = req.params;
    const { keepAiOff } = req.body || {};
    if (!mongoose.isValidObjectId(contactId)) {
      return res.status(400).json({ message: "Invalid contact id" });
    }

    const conversation = await Conversation.findOneAndUpdate(
      { contactId },
      { $set: { "humanTakeover.active": false, "humanTakeover.releasedAt": new Date() } },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // One-click "keep AI off for this contact" → forced_off.
    if (keepAiOff === true) {
      await Contact.findByIdAndUpdate(contactId, { $set: { aiMode: "forced_off" } });
    }

    await createSystemLog({
      level: "info",
      category: "ai",
      event: "human_takeover_released",
      message: "Human released conversation back to AI",
      contactId,
      metadata: { by: agentLabel(req), keepAiOff: keepAiOff === true },
    });

    return res.status(200).json({ message: "Conversation released", item: conversation, keepAiOff: keepAiOff === true });
  } catch (error) {
    console.error("releaseTakeover error:", error);
    return res.status(500).json({ message: "Failed to release conversation" });
  }
}

// GET /drafts  → pending AI drafts / escalations awaiting human action
export async function listDrafts(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const skip = (page - 1) * limit;

    const query = {
      decision: { $in: ["draft", "escalated"] },
      status: "completed",
      outboundMessageId: null,
    };

    const [items, total] = await Promise.all([
      AiReplyJob.find(query)
        .populate("contactId", "fullName phone normalizedPhone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AiReplyJob.countDocuments(query),
    ]);

    return res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("listDrafts error:", error);
    return res.status(500).json({ message: "Failed to fetch drafts" });
  }
}

// POST /drafts/:jobId/approve  { text? }  → send the (optionally edited) draft
export async function approveDraft(req, res) {
  try {
    const { jobId } = req.params;
    const { text } = req.body || {};

    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Invalid job id" });
    }

    const job = await AiReplyJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Draft not found" });
    }
    if (!["draft", "escalated"].includes(job.decision) || job.outboundMessageId) {
      return res.status(400).json({ message: "This job is not a pending draft" });
    }

    const contact = await Contact.findById(job.contactId);
    if (!contact || !contact.normalizedPhone) {
      return res.status(400).json({ message: "Contact is unavailable" });
    }
    if (contact.optedOut) {
      return res.status(403).json({ message: "This contact has opted out and cannot be messaged." });
    }

    const body = typeof text === "string" && text.trim() ? text.trim() : job.result?.text || "";
    if (!body) {
      return res.status(400).json({ message: "Draft has no text to send" });
    }

    const response = await sendSMS({ to: contact.normalizedPhone, body });

    const message = await SMSMessage.create({
      contactId: contact._id,
      phone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
      direction: "outbound",
      body,
      provider: "twilio",
      providerMessageSid: response.sid || "",
      status: response.status || "queued",
      messageType: "ai",
      metadata: { ai: { jobId: String(job._id), approvedBy: agentLabel(req), edited: body !== (job.result?.text || "") } },
    });

    await upsertConversation({
      contactId: contact._id,
      normalizedPhone: contact.normalizedPhone,
      message: body,
      direction: "outbound",
    });

    job.decision = "sent";
    job.outboundMessageId = message._id;
    if (job.result) job.result.text = body;
    job.processedAt = new Date();
    await job.save();

    await createSystemLog({
      level: "info",
      category: "ai",
      event: "ai_draft_approved",
      message: "AI draft approved and sent",
      contactId: contact._id,
      metadata: { jobId: String(job._id), messageId: String(message._id), by: agentLabel(req) },
    });

    return res.status(200).json({ message: "Draft sent", item: message, job });
  } catch (error) {
    console.error("approveDraft error:", error);
    return res.status(500).json({ message: error.message || "Failed to send draft" });
  }
}

// POST /drafts/:jobId/reject → discard the draft
export async function rejectDraft(req, res) {
  try {
    const { jobId } = req.params;
    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Invalid job id" });
    }

    const job = await AiReplyJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Draft not found" });
    }
    if (job.outboundMessageId) {
      return res.status(400).json({ message: "This draft was already sent" });
    }

    job.decision = "suppressed";
    job.status = "skipped";
    job.lastError = "rejected_by_human";
    job.processedAt = new Date();
    await job.save();

    await createSystemLog({
      level: "info",
      category: "ai",
      event: "ai_draft_rejected",
      message: "AI draft rejected",
      contactId: job.contactId,
      metadata: { jobId: String(job._id), by: agentLabel(req) },
    });

    return res.status(200).json({ message: "Draft rejected", item: job });
  } catch (error) {
    console.error("rejectDraft error:", error);
    return res.status(500).json({ message: "Failed to reject draft" });
  }
}
