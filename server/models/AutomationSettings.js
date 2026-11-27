import mongoose from "mongoose";
import { DEFAULT_TIMEZONE } from "../utils/timezone.js";

const automationSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: "default",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    sendingWindow: {
      startHour: {
        type: Number,
        default: 9,
        min: 0,
        max: 23,
      },
      endHour: {
        type: Number,
        default: 18,
        min: 0,
        max: 23,
      },
    },
    // IANA zone the sending window hours are read in (e.g. America/New_York).
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
      trim: true,
    },
    maxMessagesPerRun: {
      type: Number,
      default: 20,
      min: 1,
    },
    // Phone line types (normalized) allowed for SMS sending. Numbers whose
    // Twilio line-type lookup falls outside this set are blocked.
    allowedLineTypes: {
      type: [String],
      default: ["mobile"],
    },
    // Campaign plan C1 (Q7b): pause a campaign after this many undelivered /
    // failed campaign texts in a row (any error code). Delivered resets it.
    autoPause: {
      enabled: { type: Boolean, default: true },
      afterUndeliveredInARow: { type: Number, default: 10, min: 1 },
    },
    // Campaign plan C1 (Q8): numbers on the do-not-text list are always
    // skipped by campaigns; for manual texts and AI replies you choose.
    doNotTextList: {
      manual: { type: String, enum: ["block", "warn"], default: "warn" },
      ai: { type: String, enum: ["block", "warn"], default: "warn" },
    },
  },
  { timestamps: true }
);

export default mongoose.model("AutomationSettings", automationSettingsSchema);