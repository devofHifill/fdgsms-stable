import mongoose from "mongoose";

// Singleton document (key: "default") holding the Twilio credentials used to
// send SMS and run phone-number lookups. These take precedence over the
// TWILIO_* environment variables so operators can manage them from the UI.
const twilioSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: "default",
    },
    accountSid: {
      type: String,
      default: "",
      trim: true,
    },
    authToken: {
      type: String,
      default: "",
      trim: true,
    },
    phoneNumber: {
      type: String,
      default: "",
      trim: true,
    },
    messagingServiceSid: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("TwilioSettings", twilioSettingsSchema);
