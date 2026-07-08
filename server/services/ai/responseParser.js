// responseParser.js → turn the model's raw output into a validated reply object.
//
// Pure + defensive: whatever the model returns, we always produce a safe
// { text, intent, confidence, escalate, ok } shape. A parse failure or empty
// text forces escalate=true so the worker never sends garbage.

// Tolerate code fences / surrounding prose by grabbing the first {...} block.
function extractJson(input) {
  const str = String(input).trim();
  const unfenced = str
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return unfenced.slice(start, end + 1);
  }
  return unfenced;
}

export function parseAiReply(raw) {
  let obj = raw;

  if (typeof raw === "string") {
    try {
      obj = JSON.parse(extractJson(raw));
    } catch {
      return { text: "", intent: "unparseable", confidence: 0, escalate: true, ok: false };
    }
  }

  if (!obj || typeof obj !== "object") {
    return { text: "", intent: "unparseable", confidence: 0, escalate: true, ok: false };
  }

  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  const intent = typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : "";

  let confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(Math.max(confidence, 0), 1);

  // Escalate if the model asked to, or if there is no usable text to send.
  const escalate = Boolean(obj.escalate) || text.length === 0;

  return { text, intent, confidence, escalate, ok: true };
}
