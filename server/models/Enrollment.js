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
      enum: ["active", "paused", "completed", "stopped", "replied", "failed"],
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

    // Campaign plan C1 (Q2/Q6b): after a step is sent, the next one waits
    // until that text is DELIVERED. While waiting, nextSendAt is null and this
    // holds what we're waiting for. delayMs = the next step's delay, counted
    // from the delivery time. No report within 24 h → remaining steps cancelled.
    awaitingDelivery: {
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: "SMSMessage", default: null },
      stepNumber: { type: Number, default: null },
      sentAt: { type: Date, default: null },
      delayMs: { type: Number, default: null },
    },
    lastDeliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

enrollmentSchema.index({ status: 1, nextSendAt: 1 });
enrollmentSchema.index({ status: 1, "awaitingDelivery.messageId": 1 });
enrollmentSchema.index({ contactId: 1, campaignId: 1 });

export default mongoose.model("Enrollment", enrollmentSchema);