import mongoose from "mongoose";

const smsMessageSchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    normalizedPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      default: "twilio",
    },
    providerMessageSid: {
      type: String,
      default: "",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "accepted",
        "sending",
        "sent",
        "delivered",
        "undelivered",
        "failed",
        "received",
        "unknown",
      ],
      default: "unknown",
    },
    errorCode: {
      type: String,
      default: "",
    },
    errorMessage: {
      type: String,
      default: "",
    },

    // NEW: sequence tracking
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
    stepNumber: {
      type: Number,
      default: null,
    },
    messageType: {
      type: String,
      enum: ["manual", "automation", "inbound"],
      default: "manual",
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

export default mongoose.model("SMSMessage", smsMessageSchema);