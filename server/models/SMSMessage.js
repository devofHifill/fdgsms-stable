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
      enum: ["manual", "automation", "inbound", "ai"],
      default: "manual",
    },

    metadata: {
      type: Object,
      default: {},
    },

    // Campaign plan C6: what Twilio charged for this text (positive amount,
    // e.g. 0.0083 USD). Twilio fills the price in a little after sending, so a
    // background job looks it up; null = not known yet.
    price: { type: Number, default: null },
    priceUnit: { type: String, default: "" },
    priceCheckedAt: { type: Date, default: null },
    priceFetchAttempts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// One stored inbound message per Twilio MessageSid, so a webhook retry can't
// be saved twice. Partial: outbound rows and rows without a sid are exempt.
// If old duplicates already exist the index build fails (logged by mongoose)
// and the webhook's lookup-before-save still dedupes new retries.
// Campaign plan C3: today's counts (platform limit, step-1 target).
smsMessageSchema.index({ direction: 1, createdAt: -1 });
smsMessageSchema.index({ campaignId: 1, stepNumber: 1, createdAt: -1 });

smsMessageSchema.index(
  { providerMessageSid: 1 },
  {
    name: "uniq_inbound_provider_sid",
    unique: true,
    partialFilterExpression: {
      direction: "inbound",
      providerMessageSid: { $type: "string", $gt: "" },
    },
  }
);

export default mongoose.model("SMSMessage", smsMessageSchema);