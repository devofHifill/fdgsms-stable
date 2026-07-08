import mongoose from "mongoose";

// AiSettings → single global configuration document for the AI Reply System.
//
// One doc with key "default" (same pattern as AutomationSettings). Read by the
// enqueue check (Phase 2), AI service (Phase 3), and worker (Phase 4); exposed
// via the settings API (Phase 5) and dashboard (Phase 6).
//
// Phase 1 defines the schema + safe defaults only — nothing reads it yet.
// Field groups map to the plan's Part A sections; pacing/cost caps (§8/§9) and
// audit (§13) are deferred to later phases.
const aiSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: "default",
    },

    // §1/§2 Master controls
    enabled: {
      // Global kill switch (layer 1). Off by default — opt in explicitly.
      type: Boolean,
      default: false,
    },
    replyMode: {
      // off = never; draft = human approves; auto = auto-send;
      // hybrid = auto-send above confidence threshold, else draft.
      type: String,
      enum: ["off", "draft", "auto", "hybrid"],
      default: "draft",
    },
    activePhoneNumbers: {
      // Twilio numbers / messaging services the AI answers on. Empty = all.
      type: [String],
      default: [],
    },

    // §2 Default AI state for new/"default" contacts (resolves Contact.aiMode "default")
    defaultContactAiEnabled: {
      type: Boolean,
      default: true,
    },

    // §4 Persona & knowledge
    persona: {
      businessName: { type: String, default: "" },
      role: { type: String, default: "" },
      tone: { type: String, default: "friendly, concise, professional" },
      systemInstructions: { type: String, default: "" },
      faq: {
        type: [
          {
            _id: false,
            question: { type: String, default: "" },
            answer: { type: String, default: "" },
          },
        ],
        default: [],
      },
      doRules: { type: [String], default: [] },
      dontRules: { type: [String], default: [] },
      fallbackMessage: {
        type: String,
        default: "Thanks for your message — someone from our team will follow up shortly.",
      },
      signature: { type: String, default: "" },
      language: { type: String, default: "auto" },
    },

    // §5 Model & behavior (minimal now; creativity/memory depth later)
    model: {
      type: String,
      enum: ["haiku", "sonnet"],
      default: "haiku",
    },

    // §6 Message length & format
    messageFormat: {
      maxChars: { type: Number, default: 160, min: 1 },
      maxSegments: { type: Number, default: 1, min: 1 },
      onTooLong: {
        type: String,
        enum: ["regenerate", "truncate"],
        default: "regenerate",
      },
      stripNonGsm: { type: Boolean, default: true },
    },

    // §7 Conversation volume limits
    volumeLimits: {
      maxRepliesWithoutHuman: { type: Number, default: 5, min: 1 },
      neverDoubleText: { type: Boolean, default: true },
      maxPerConversationPerDay: { type: Number, default: 10, min: 1 },
      onCapHit: {
        type: String,
        enum: ["escalate", "fallback", "silent"],
        default: "escalate",
      },
    },

    // §10/§11 Safety, compliance & quality
    escalationKeywords: {
      type: [String],
      default: [],
    },
    blockedTopics: {
      type: [String],
      default: [],
    },
    minConfidenceToSend: {
      type: Number,
      default: 0.6,
      min: 0,
      max: 1,
    },
    retryLimit: {
      type: Number,
      default: 2,
      min: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("AiSettings", aiSettingsSchema);
