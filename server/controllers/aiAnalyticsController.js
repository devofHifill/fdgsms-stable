// aiAnalyticsController.js → AI Reply System analytics + a no-send test/preview.
//
// Metrics are aggregated from existing data (AiReplyJob, SMSMessage type "ai",
// Contact opt-outs). Cost/token tracking is intentionally deferred — it needs
// token capture in the AI service, which isn't wired yet.

import mongoose from "mongoose";
import AiReplyJob from "../models/AiReplyJob.js";
import SMSMessage from "../models/SMSMessage.js";
import Contact from "../models/Contact.js";
import { getAiSettings } from "../services/aiReplyService.js";
import { generateAiReply } from "../services/aiReplyGenerator.js";

// GET /api/ai/analytics?days=30
export async function getAiAnalytics(req, res) {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [jobAgg, aiMessagesSent, optOuts] = await Promise.all([
      AiReplyJob.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: ["$decision", "sent"] }, 1, 0] } },
            drafted: { $sum: { $cond: [{ $eq: ["$decision", "draft"] }, 1, 0] } },
            escalated: { $sum: { $cond: [{ $eq: ["$decision", "escalated"] }, 1, 0] } },
            suppressed: { $sum: { $cond: [{ $eq: ["$decision", "suppressed"] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            // Average confidence over jobs that actually produced a reply.
            confSum: { $sum: { $ifNull: ["$result.confidence", 0] } },
            confCount: {
              $sum: { $cond: [{ $ne: ["$result.confidence", null] }, 1, 0] },
            },
          },
        },
      ]),
      SMSMessage.countDocuments({
        messageType: "ai",
        direction: "outbound",
        createdAt: { $gte: since },
      }),
      Contact.countDocuments({ optedOut: true, optedOutAt: { $gte: since } }),
    ]);

    const j = jobAgg[0] || {};
    const total = j.total || 0;
    const avgConfidence = j.confCount ? j.confSum / j.confCount : 0;

    return res.status(200).json({
      rangeDays: days,
      metrics: {
        totalJobs: total,
        sent: j.sent || 0,
        drafted: j.drafted || 0,
        escalated: j.escalated || 0,
        suppressed: j.suppressed || 0,
        failed: j.failed || 0,
        pending: j.pending || 0,
        aiMessagesSent,
        optOuts,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        handoffRate: total
          ? Math.round((((j.drafted || 0) + (j.escalated || 0)) / total) * 100)
          : 0,
        escalationRate: total ? Math.round(((j.escalated || 0) / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("getAiAnalytics error:", error);
    return res.status(500).json({ message: "Failed to load AI analytics" });
  }
}

// POST /api/ai/test-reply  { inboundText, contactId? }
// Generates an AI reply against the current settings and returns the structured
// result WITHOUT sending anything or creating a job. Great for tuning the
// persona / prompt before going live. (Calls the provider, so a key is needed.)
export async function testAiReply(req, res) {
  try {
    const { inboundText, contactId } = req.body || {};

    if (!inboundText || !String(inboundText).trim()) {
      return res.status(400).json({ message: "inboundText is required" });
    }

    const settings = await getAiSettings();

    if (!settings.enabled) {
      // A soft warning — testing still works, but flag that live replies are off.
      // (We do not block the test.)
    }

    let contact = {};
    let history = [];
    if (contactId && mongoose.isValidObjectId(contactId)) {
      contact = (await Contact.findById(contactId).lean()) || {};
      history = await SMSMessage.find({ contactId })
        .sort({ createdAt: 1 })
        .limit(50)
        .select("direction body")
        .lean();
    }

    const reply = await generateAiReply({
      settings,
      contact,
      history,
      inboundText: String(inboundText).trim(),
    });

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("testAiReply error:", error);
    return res.status(502).json({ message: error.message || "AI generation failed" });
  }
}
