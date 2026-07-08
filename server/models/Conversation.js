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

    unreadCount: {
      type: Number,
      default: 0,
    },

    // 🤖 AI REPLY — human takeover (layer 3, temporary/session).
    // When active, the AI must not reply on this conversation. Claimed by an
    // agent (manual button, opening the thread, or sending a manual reply).
    humanTakeover: {
      active: {
        type: Boolean,
        default: false,
      },
      // Agent who owns the conversation. No ref yet (multi-user is a later
      // phase); stored as an id + display name for now.
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      agentName: {
        type: String,
        default: "",
      },
      claimedAt: {
        type: Date,
        default: null,
      },
      releasedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Conversation", conversationSchema);