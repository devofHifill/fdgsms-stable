// campaignController.js → campaign management

// Work: Creates and manages SMS campaigns.

// Usually does:
// create campaign
// get all campaigns
// update campaign
// delete campaign
// store campaign steps/messages
// In FDGSMS:

// This is where your 4-message or sequence-based campaign logic is defined.

import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import Enrollment from "../models/Enrollment.js";
import SMSMessage from "../models/SMSMessage.js";
import { NO_REPORT_AFTER_MS } from "../services/campaignDeliveryService.js";
import AutomationSettings from "../models/AutomationSettings.js";
import {
  parseGap,
  gapToMs,
  DEFAULT_CAMPAIGN_GAP,
  DEFAULT_MIN_GAP,
} from "../utils/campaignGap.js";

// Normalize an incoming steps array into stored step docs.
function normalizeSteps(steps = []) {
  return steps.map((step, index) => ({
    stepNumber: index + 1,
    body: String(step.body || "").trim(),
    delayHours: Number(step.delayHours) || 0,
  }));
}

// Campaign plan C2: the campaign's gap must not be shorter than the Settings
// minimum gap (itself never below 5 s). Returns { gap } or { error }.
async function validateCampaignGap(input) {
  const settings = await AutomationSettings.findOne({ key: "default" }).lean();
  const minMs = gapToMs(settings?.minCampaignGap || DEFAULT_MIN_GAP);
  return parseGap(input, { minMs, label: "Gap between texts" });
}

export async function createCampaign(req, res) {
  try {
    const { name, isActive, steps, gap } = req.body;

    if (!name || !Array.isArray(steps) || !steps.length) {
      return res.status(400).json({ message: "Invalid campaign data" });
    }

    let campaignGap = DEFAULT_CAMPAIGN_GAP;
    if (gap !== undefined) {
      const checked = await validateCampaignGap(gap);
      if (checked.error) return res.status(400).json({ message: checked.error });
      campaignGap = checked.gap;
    }

    const campaign = await Campaign.create({
      name: String(name).trim(),
      isActive: typeof isActive === "boolean" ? isActive : true,
      steps: normalizeSteps(steps),
      gap: campaignGap,
    });

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: "Failed to create campaign" });
  }
}

export async function getCampaigns(req, res) {
  const items = await Campaign.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
}

// Update a campaign — accepts any subset of { name, isActive, steps }.
// Used for full edits and the quick activate/pause toggle.
export async function updateCampaign(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid campaign id" });
    }

    const { name, isActive, steps, gap } = req.body;
    const update = {};

    if (gap !== undefined) {
      const checked = await validateCampaignGap(gap);
      if (checked.error) return res.status(400).json({ message: checked.error });
      update.gap = checked.gap;
    }

    if (typeof name === "string") update.name = name.trim();
    if (typeof isActive === "boolean") update.isActive = isActive;
    // Resuming (by hand) clears an auto-pause and its run counter (Q7c).
    if (isActive === true) {
      update.consecutiveUndelivered = 0;
      update.pausedReason = "";
      update.autoPausedAt = null;
    }
    if (Array.isArray(steps)) {
      if (!steps.length) {
        return res.status(400).json({ message: "Campaign needs at least one step" });
      }
      update.steps = normalizeSteps(steps);
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const campaign = await Campaign.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: "Failed to update campaign" });
  }
}

// Delete a campaign — blocked if enrollments reference it (protects data).
export async function deleteCampaign(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid campaign id" });
    }

    const enrollmentCount = await Enrollment.countDocuments({ campaignId: id });
    if (enrollmentCount > 0) {
      return res.status(409).json({
        message: `Campaign has ${enrollmentCount} enrollment(s). Pause it instead of deleting.`,
      });
    }

    const campaign = await Campaign.findByIdAndDelete(id);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json({ message: "Campaign deleted", id });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete campaign" });
  }
}

// Clone a campaign — copies steps into a new, inactive "(copy)" campaign.
export async function cloneCampaign(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid campaign id" });
    }

    const source = await Campaign.findById(id).lean();
    if (!source) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const campaign = await Campaign.create({
      name: `${source.name} (copy)`,
      isActive: false,
      steps: normalizeSteps(source.steps || []),
      gap: source.gap?.value ? { value: source.gap.value, unit: source.gap.unit || "seconds" } : DEFAULT_CAMPAIGN_GAP,
    });

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: "Failed to clone campaign" });
  }
}

// Aggregate performance stats for every campaign (keyed by campaign id).
export async function getCampaignStats(req, res) {
  try {
    const noReportBefore = new Date(Date.now() - NO_REPORT_AFTER_MS);
    const [enrollAgg, msgAgg] = await Promise.all([
      Enrollment.aggregate([
        {
          $group: {
            _id: "$campaignId",
            enrolled: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            stopped: { $sum: { $cond: [{ $eq: ["$status", "stopped"] }, 1, 0] } },
            replied: { $sum: { $cond: [{ $eq: ["$stopReason", "replied"] }, 1, 0] } },
            // Campaign plan C1: excluded after an undelivered step, skipped
            // because already on the do-not-text list, or no report in 24 h.
            excludedUndelivered: {
              $sum: {
                $cond: [
                  { $regexMatch: { input: { $ifNull: ["$stopReason", ""] }, regex: "^undelivered_step_" } },
                  1,
                  0,
                ],
              },
            },
            skippedDoNotText: { $sum: { $cond: [{ $eq: ["$stopReason", "do_not_text_list"] }, 1, 0] } },
            noReportCancelled: { $sum: { $cond: [{ $eq: ["$stopReason", "no_delivery_report"] }, 1, 0] } },
            waitingForDelivery: {
              $sum: { $cond: [{ $ne: [{ $ifNull: ["$awaitingDelivery.messageId", null] }, null] }, 1, 0] },
            },
          },
        },
      ]),
      // Delivery outcome of every campaign text, per campaign and step.
      SMSMessage.aggregate([
        { $match: { direction: "outbound", campaignId: { $ne: null } } },
        {
          $project: {
            campaignId: 1,
            stepNumber: 1,
            outcome: {
              $switch: {
                branches: [
                  { case: { $eq: ["$status", "delivered"] }, then: "delivered" },
                  { case: { $in: ["$status", ["undelivered", "failed"]] }, then: "undelivered" },
                  { case: { $lt: ["$createdAt", noReportBefore] }, then: "noReport" },
                ],
                default: "waiting",
              },
            },
          },
        },
        {
          $group: {
            _id: { campaignId: "$campaignId", step: "$stepNumber", outcome: "$outcome" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = {};
    const blank = () => ({
      enrolled: 0, active: 0, completed: 0, stopped: 0, replied: 0, sent: 0, replyRate: 0,
      delivered: 0, undelivered: 0, waiting: 0, noReport: 0, deliveryRate: 0,
      excludedUndelivered: 0, skippedDoNotText: 0, noReportCancelled: 0, waitingForDelivery: 0,
      steps: {},
    });

    for (const row of enrollAgg) {
      if (!row._id) continue;
      const id = String(row._id);
      stats[id] = {
        ...blank(),
        enrolled: row.enrolled,
        active: row.active,
        completed: row.completed,
        stopped: row.stopped,
        replied: row.replied,
        replyRate: row.enrolled
          ? Math.round((row.replied / row.enrolled) * 100)
          : 0,
        excludedUndelivered: row.excludedUndelivered,
        skippedDoNotText: row.skippedDoNotText,
        noReportCancelled: row.noReportCancelled,
        waitingForDelivery: row.waitingForDelivery,
      };
    }

    for (const row of msgAgg) {
      if (!row._id?.campaignId) continue;
      const id = String(row._id.campaignId);
      if (!stats[id]) stats[id] = blank();
      const s = stats[id];
      const step = String(row._id.step ?? "?");
      s.steps[step] = s.steps[step] || { sent: 0, delivered: 0, undelivered: 0, waiting: 0, noReport: 0 };
      s.steps[step].sent += row.count;
      s.steps[step][row._id.outcome] += row.count;
      s.sent += row.count;
      s[row._id.outcome] += row.count;
    }

    for (const s of Object.values(stats)) {
      const finished = s.delivered + s.undelivered;
      s.deliveryRate = finished ? Math.round((s.delivered / finished) * 100) : 0;
    }

    return res.json({ stats });
  } catch (error) {
    console.error("getCampaignStats error:", error);
    res.status(500).json({ message: "Failed to load campaign stats" });
  }
}