import mongoose from "mongoose";

const systemLogSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ["info", "warn", "error"],
      default: "info",
      index: true,
    },
    category: {
      type: String,
      enum: [
        "sms",
        "upload",
        "webhook",
        "automation",
        "auth",
        "api",
        "system",
      ],
      default: "system",
      index: true,
    },
    event: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
      index: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      default: null,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
      index: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ category: 1, level: 1, createdAt: -1 });

export default mongoose.model("SystemLog", systemLogSchema);