// guardrails.js → pure decision helpers for the AI reply worker.
//
// No DB / SDK, so they're easy to unit test. The worker uses these to decide
// whether a generated reply is sent or held as a draft, and to keep the text
// within SMS limits.

// Decide what to do with a generated reply given the reply mode + AI signals.
// Returns "sent" | "draft" | "escalated".
export function decideOutcome({
  replyMode,
  escalate,
  confidence,
  minConfidenceToSend = 0.6,
}) {
  // The model (or a guard) asked for a human — never auto-send.
  if (escalate) return "escalated";

  switch (replyMode) {
    case "auto":
      return "sent";
    case "hybrid":
      return Number(confidence) >= Number(minConfidenceToSend) ? "sent" : "draft";
    case "draft":
    default:
      // draft (and any unexpected mode) → hold for human approval.
      return "draft";
  }
}

// Normalize + cap an SMS body. When stripNonGsm is set, smart punctuation is
// folded to GSM-7 equivalents and emoji/pictographs are removed so the message
// doesn't silently become a costly multi-segment UCS-2 SMS.
export function enforceMessageFormat(text, messageFormat = {}) {
  let out = String(text || "");

  if (messageFormat.stripNonGsm) {
    out = out
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/\p{Extended_Pictographic}/gu, "");
  }

  out = out.replace(/[ \t]+/g, " ").trim();

  const maxChars = Number(messageFormat.maxChars) || 160;
  const maxSegments = Number(messageFormat.maxSegments) || 1;
  const hardCap = Math.max(maxChars * maxSegments, 1);

  let truncated = false;
  if (out.length > hardCap) {
    out = out.slice(0, hardCap).trim();
    truncated = true;
  }

  return { text: out, truncated };
}
