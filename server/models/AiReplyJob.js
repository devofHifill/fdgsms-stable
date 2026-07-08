import mongoose from "mongoose";

// AiReplyJob → one AI reply task per eligible inbound SMS.
//
// Created by the inbound webhook (Phase 2) when a message is eligible for an
// AI reply, then picked up by aiReplyWorker (Phase 4), which builds context,
// calls Claude (Phase 3), applies guardrails, and either drafts or sends.
//
// Phase 1 defines the schema only — nothing reads or writes it yet.
const aiReplyJobSchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    // The inbound message that triggered this job.
    inboundMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMSMessage",
      required: true,
    },

    // Job lifecycle.
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: "",
    },

    // Structured AI output (filled in Phase 3/4). Mirrors the AI service's
    // { text, intent, confidence, escalate } contract.
    result: {
      text: { type: String, default: "" },
      intent: { type: String, default: "" },
      confidence: { type: Number, default: null },
      escalate: { type: Boolean, default: false },
    },

    // What the worker ultimately did with the result.
    decision: {
      type: String,
      enum: ["", "draft", "sent", "escalated", "suppressed"],
      default: "",
    },
    // The draft/sent outbound message this job produced, if any.
    outboundMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMSMessage",
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Worker pulls oldest pending jobs first.
aiReplyJobSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model("AiReplyJob", aiReplyJobSchema);
