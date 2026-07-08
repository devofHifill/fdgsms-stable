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

// Normalize an incoming steps array into stored step docs.
function normalizeSteps(steps = []) {
  return steps.map((step, index) => ({
    stepNumber: index + 1,
    body: String(step.body || "").trim(),
    delayHours: Number(step.delayHours) || 0,
  }));
}

export async function createCampaign(req, res) {
  try {
    const { name, isActive, steps } = req.body;

    if (!name || !Array.isArray(steps) || !steps.length) {
      return res.status(400).json({ message: "Invalid campaign data" });
    }

    const campaign = await Campaign.create({
      name: String(name).trim(),
      isActive: typeof isActive === "boolean" ? isActive : true,
      steps: normalizeSteps(steps),
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

    const { name, isActive, steps } = req.body;
    const update = {};

    if (typeof name === "string") update.name = name.trim();
    if (typeof isActive === "boolean") update.isActive = isActive;
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
    });

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: "Failed to clone campaign" });
  }
}

// Aggregate performance stats for every campaign (keyed by campaign id).
export async function getCampaignStats(req, res) {
  try {
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
          },
        },
      ]),
      SMSMessage.aggregate([
        { $match: { direction: "outbound", campaignId: { $ne: null } } },
        { $group: { _id: "$campaignId", sent: { $sum: 1 } } },
      ]),
    ]);

    const stats = {};
    const blank = () => ({
      enrolled: 0, active: 0, completed: 0, stopped: 0, replied: 0, sent: 0, replyRate: 0,
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
      };
    }

    for (const row of msgAgg) {
      if (!row._id) continue;
      const id = String(row._id);
      if (!stats[id]) stats[id] = blank();
      stats[id].sent = row.sent;
    }

    return res.json({ stats });
  } catch (error) {
    console.error("getCampaignStats error:", error);
    res.status(500).json({ message: "Failed to load campaign stats" });
  }
}