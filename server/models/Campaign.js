import mongoose from "mongoose";

const campaignStepSchema = new mongoose.Schema(
  {
    stepNumber: {
      type: Number,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    delayHours: {
      type: Number,
      default: 24, // delay after previous step
    },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    steps: {
      type: [campaignStepSchema],
      default: [],
    },
    // Campaign plan C2: wait this long between two texts of this campaign.
    // Never below the Settings minimum gap (≥ 5 s).
    gap: {
      value: { type: Number, default: 30, min: 0 },
      unit: { type: String, enum: ["seconds", "minutes", "hours"], default: "seconds" },
    },
    // When this campaign last sent a text (claimed atomically before sending).
    lastCampaignSendAt: {
      type: Date,
      default: null,
    },
    // Campaign plan C1 (Q7b/Q7c): undelivered campaign texts in a row; a
    // delivered one resets it. Reaching the Settings limit pauses the campaign
    // (isActive=false) until you resume it.
    consecutiveUndelivered: {
      type: Number,
      default: 0,
    },
    pausedReason: {
      type: String,
      default: "",
    },
    autoPausedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Campaign", campaignSchema);