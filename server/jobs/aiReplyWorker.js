// aiReplyWorker.js → background loop that turns pending AiReplyJobs into replies.
//
// Runs on an interval (wired in index.js), like runAutomationCycle. For each
// pending job it re-checks eligibility (state may have changed since enqueue),
// generates a reply via the AI service, then EITHER sends it (auto / confident
// hybrid) or stores it on the job as a draft/escalation for a human to review.
// The poll interval doubles as the human-takeover race buffer.

import AiReplyJob from "../models/AiReplyJob.js";
import Contact from "../models/Contact.js";
import Conversation from "../models/Conversation.js";
import SMSMessage from "../models/SMSMessage.js";

import { sendSMS } from "../services/twilioService.js";
import { upsertConversation } from "../services/conversationService.js";
import { createSystemLog } from "../services/systemLogService.js";
import {
  getAiSettings,
  evaluateInboundAiEligibility,
} from "../services/aiReplyService.js";
import { generateAiReply } from "../services/aiReplyGenerator.js";
import { getRecentAiHistory } from "../services/aiHistoryService.js";
import { checkDoNotText } from "../services/doNotTextService.js";
import { decideOutcome, enforceMessageFormat } from "../services/ai/guardrails.js";
import { singleFlight } from "../utils/singleFlight.js";

const MAX_JOBS_PER_RUN = 10;
// A job still "processing" after this long was abandoned by a crash/restart.
export const STUCK_JOB_MS = 5 * 60 * 1000;

export function maxAttemptsFor(settings) {
  return (Number(settings?.retryLimit) || 2) + 1;
}

// Atomically move one job pending → processing. Returns the claimed job, or
// null if another run (or another server process) already took it.
export async function claimAiReplyJob(jobId, now = new Date()) {
  return AiReplyJob.findOneAndUpdate(
    { _id: jobId, status: "pending" },
    { $set: { status: "processing", claimedAt: now }, $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
}

// Jobs abandoned in "processing" block every future AI reply for that contact
// (the enqueue dedup sees them as in flight). Put them back in the queue, or
// fail them if they are out of attempts. Jobs from before claimedAt existed
// are judged by updatedAt.
export async function recoverStuckAiReplyJobs(settings, now = new Date()) {
  const cutoff = new Date(now.getTime() - STUCK_JOB_MS);
  const stale = {
    status: "processing",
    $or: [
      { claimedAt: { $lt: cutoff } },
      { claimedAt: null, updatedAt: { $lt: cutoff } },
    ],
  };
  const maxAttempts = maxAttemptsFor(settings);
  const error = "Recovered: job was left in processing (worker crash or restart)";

  const failed = await AiReplyJob.updateMany(
    { ...stale, attempts: { $gte: maxAttempts } },
    { $set: { status: "failed", lastError: error, processedAt: now, claimedAt: null } }
  );
  const requeued = await AiReplyJob.updateMany(stale, {
    $set: { status: "pending", lastError: error, claimedAt: null },
  });

  const counts = {
    requeued: requeued.modifiedCount || 0,
    failed: failed.modifiedCount || 0,
  };

  if (counts.requeued || counts.failed) {
    await createSystemLog({
      level: "warn",
      category: "ai",
      event: "ai_reply_jobs_recovered",
      message: `Recovered stuck AI reply jobs: ${counts.requeued} requeued, ${counts.failed} failed`,
      metadata: counts,
    });
  }

  return counts;
}

async function finalize(job, { status, decision, error }) {
  job.status = status;
  if (decision !== undefined) job.decision = decision;
  job.lastError = error || "";
  job.processedAt = new Date();
  await job.save();
}

// Suppressed / not-sent for a benign reason (no retry).
async function skip(job, reason) {
  await finalize(job, { status: "skipped", decision: "suppressed", error: reason });

  await createSystemLog({
    level: "info",
    category: "ai",
    event: "ai_reply_skipped",
    message: `AI reply skipped: ${reason}`,
    contactId: job.contactId,
    metadata: { jobId: String(job._id), reason },
  });
}

// Error path — retry until retryLimit is exhausted, then fail.
async function retryOrFail(job, settings, errorMessage) {
  const maxAttempts = maxAttemptsFor(settings);

  if (job.attempts >= maxAttempts) {
    await finalize(job, { status: "failed", error: errorMessage });
  } else {
    // Leave it pending so the next cycle retries it.
    job.status = "pending";
    job.lastError = errorMessage;
    await job.save();
  }

  await createSystemLog({
    level: "error",
    category: "ai",
    event: "ai_reply_error",
    message: errorMessage,
    contactId: job.contactId,
    metadata: {
      jobId: String(job._id),
      attempts: job.attempts,
      willRetry: job.status === "pending",
    },
  });
}

// `job` has already been claimed (status "processing") by claimAiReplyJob.
async function processAiReplyJob(job, settings) {
  const [contact, inbound] = await Promise.all([
    Contact.findById(job.contactId),
    SMSMessage.findById(job.inboundMessageId),
  ]);

  if (!contact || !inbound) {
    return skip(job, "missing_contact_or_message");
  }

  const conversation = job.conversationId
    ? await Conversation.findById(job.conversationId)
    : await Conversation.findOne({ contactId: job.contactId });

  // Re-evaluate the layered gate at send time — opt-out, human takeover, or an
  // AI-off toggle may have happened between enqueue and now.
  const toNumber = inbound.metadata?.to || "";
  const { eligible, reason } = evaluateInboundAiEligibility({
    contact,
    conversation,
    settings,
    toNumber,
  });
  if (!eligible) {
    return skip(job, reason);
  }

  // Never double-text: if we've already replied since the inbound, hold off.
  if (settings.volumeLimits?.neverDoubleText && conversation?.lastDirection === "outbound") {
    return skip(job, "already_replied");
  }

  if (!contact.normalizedPhone) {
    return skip(job, "missing_phone");
  }

  // Do-not-text list: AI replies follow the Settings choice (block / warn).
  const dnt = await checkDoNotText(contact.normalizedPhone, "ai");
  if (dnt.blocked) {
    return skip(job, "do_not_text_list");
  }

  // Latest messages (returned oldest first) for context.
  const history = await getRecentAiHistory(contact._id);

  let reply;
  try {
    reply = await generateAiReply({
      settings,
      contact,
      history,
      inboundText: inbound.body,
    });
  } catch (genErr) {
    return retryOrFail(job, settings, genErr.message || "AI generation failed");
  }

  job.result = {
    text: reply.text,
    intent: reply.intent,
    confidence: reply.confidence,
    escalate: reply.escalate,
  };

  const outcome = decideOutcome({
    replyMode: settings.replyMode,
    escalate: reply.escalate,
    confidence: reply.confidence,
    minConfidenceToSend: settings.minConfidenceToSend,
  });

  // Draft / escalation → hold on the job for the human inbox; send nothing.
  if (outcome !== "sent") {
    await finalize(job, { status: "completed", decision: outcome });

    await createSystemLog({
      level: "info",
      category: "ai",
      event: outcome === "escalated" ? "ai_reply_escalated" : "ai_reply_drafted",
      message: `AI reply ${outcome} for human review`,
      contactId: contact._id,
      metadata: {
        jobId: String(job._id),
        intent: reply.intent,
        confidence: reply.confidence,
      },
    });
    return;
  }

  // Auto / confident-hybrid → format-guard and send.
  const { text: formatted } = enforceMessageFormat(reply.text, settings.messageFormat);
  const signature = settings.persona?.signature
    ? `\n${settings.persona.signature}`
    : "";
  const body = `${formatted}${signature}`.trim();

  try {
    const response = await sendSMS({ to: contact.normalizedPhone, body });

    const message = await SMSMessage.create({
      contactId: contact._id,
      phone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
      direction: "outbound",
      body,
      provider: "twilio",
      providerMessageSid: response.sid || "",
      status: response.status || "queued",
      enrollmentId: null,
      campaignId: null,
      stepNumber: null,
      messageType: "ai",
      metadata: {
        ai: {
          jobId: String(job._id),
          intent: reply.intent,
          confidence: reply.confidence,
        },
      },
    });

    await upsertConversation({
      contactId: contact._id,
      normalizedPhone: contact.normalizedPhone,
      message: body,
      direction: "outbound",
    });

    job.outboundMessageId = message._id;
    await finalize(job, { status: "completed", decision: "sent" });

    await createSystemLog({
      level: "info",
      category: "ai",
      event: "ai_reply_sent",
      message: "AI reply sent",
      contactId: contact._id,
      metadata: {
        jobId: String(job._id),
        messageId: String(message._id),
        intent: reply.intent,
        confidence: reply.confidence,
      },
    });
  } catch (sendErr) {
    return retryOrFail(job, settings, sendErr.message || "AI send failed");
  }
}

async function aiReplyCycle() {
  try {
    const settings = await getAiSettings();

    // Global gate — worker does nothing while AI is off.
    if (!settings.enabled || settings.replyMode === "off") {
      return;
    }

    await recoverStuckAiReplyJobs(settings);

    const candidates = await AiReplyJob.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(MAX_JOBS_PER_RUN)
      .select("_id")
      .lean();

    for (const { _id } of candidates) {
      const job = await claimAiReplyJob(_id);
      if (!job) continue; // claimed elsewhere — never process a job twice

      try {
        await processAiReplyJob(job, settings);
      } catch (err) {
        console.error("AI reply job error:", err);
        await createSystemLog({
          level: "error",
          category: "ai",
          event: "ai_reply_job_crashed",
          message: err.message || "Unexpected AI reply job error",
          metadata: { jobId: String(job._id) },
        });
      }
    }
  } catch (error) {
    console.error("runAiReplyCycle fatal error:", error);
    await createSystemLog({
      level: "error",
      category: "ai",
      event: "ai_reply_cycle_fatal_error",
      message: error.message || "Fatal AI reply cycle error",
    });
  }
}

// Interval ticks that arrive while a cycle is still running are skipped.
export const runAiReplyCycle = singleFlight(aiReplyCycle);
