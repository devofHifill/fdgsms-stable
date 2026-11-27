import mongoose from "mongoose";

// SuppressedNumber → the do-not-text list (campaign plan C1).
//
// A number lands here when a campaign text to it comes back undelivered or
// failed, whatever the error code. Campaigns never text it again; manual texts
// and AI replies follow the Settings choice (block / warn). Kept by phone
// number, so it survives the contact being deleted and re-imported.
const suppressedNumberSchema = new mongoose.Schema(
  {
    normalizedPhone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    reason: {
      type: String,
      default: "undelivered",
    },
    errorCode: {
      type: String,
      default: "",
    },
    errorMessage: {
      type: String,
      default: "",
    },
    // Where it happened (for the contact page / reports).
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "SMSMessage", default: null },
    stepNumber: { type: Number, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SuppressedNumber", suppressedNumberSchema);
