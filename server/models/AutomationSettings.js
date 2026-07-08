import mongoose from "mongoose";

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
  },
  { timestamps: true }
);

export default mongoose.model("AutomationSettings", automationSettingsSchema);