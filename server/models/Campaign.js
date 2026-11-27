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
    // Campaign plan C4: steps 2+ start "afterPrevious" (delayHours after the
    // previous step is delivered) or "fixedAt" = not before `at`, and at least
    // minWaitHours after that contact's previous step was delivered.
    start: {
      type: { type: String, enum: ["afterPrevious", "fixedAt"], default: "afterPrevious" },
      at: { type: Date, default: null },
      minWaitHours: { type: Number, default: 24, min: 0 },
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
    // Campaign plan C3: start new contacts (step 1) until this many step-1
    // texts are delivered today. null = no daily target.
    dailyStep1Target: {
      type: Number,
      default: null,
      min: 1,
    },
    // Campaign plan C4: when the campaign runs (dates in the account timezone).
    schedule: {
      sendDays: { type: [Number], default: () => [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
      startAt: { type: Date, default: null }, // null = straight away
      endAfterDays: { type: Number, default: null },
      endAfterWeeks: { type: Number, default: null },
      endOn: { type: Date, default: null }, // stops at this moment (midnight after the chosen day)
      untilContactsRunOut: { type: Boolean, default: false },
    },
    // running → finishing (no new contacts; in-progress contacts finish their
    // steps) → completed (nobody left). Pausing is separate (isActive).
    state: {
      type: String,
      enum: ["running", "finishing", "completed"],
      default: "running",
    },
    finishingReason: { type: String, default: "" }, // end_date | contacts_ran_out
    finishingAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
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