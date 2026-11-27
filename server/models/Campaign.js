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