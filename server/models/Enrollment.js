import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },

    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },

    currentStep: {
      type: Number,
      default: 1,
    },

    nextSendAt: {
      type: Date,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "completed", "stopped", "replied", "failed"],
      default: "active",
      index: true,
    },

    stopReason: {
      type: String,
      default: "",
    },

    failureCount: {
      type: Number,
      default: 0,
    },

    lastError: {
      type: String,
      default: "",
    },

    lastSentAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    replyDetectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

enrollmentSchema.index({ status: 1, nextSendAt: 1 });
enrollmentSchema.index({ contactId: 1, campaignId: 1 });

export default mongoose.model("Enrollment", enrollmentSchema);