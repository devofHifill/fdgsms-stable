import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      unique: true,
      index: true,
    },

    normalizedPhone: {
      type: String,
      required: true,
      index: true,
    },

    lastMessage: {
      type: String,
      default: "",
    },

    lastMessageAt: {
      type: Date,
      default: null,
    },

    lastDirection: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "outbound",
    },

    status: {
      type: String,
      enum: ["active", "replied", "closed"],
      default: "active",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Conversation", conversationSchema);