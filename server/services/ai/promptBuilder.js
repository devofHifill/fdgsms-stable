// promptBuilder.js → build the system prompt + message array for the AI reply.
//
// Pure functions (no SDK, no DB) so they are cheap to unit test. Turns the
// AiSettings persona/knowledge + conversation history into the inputs the
// provider client sends to the model.

import { renderTemplate, buildContactTemplateVariables } from "../../utils/template.js";

const DEFAULT_MEMORY_DEPTH = 10;

// The strict JSON contract the model must return. Parsed by responseParser.
const OUTPUT_CONTRACT = `Respond with ONLY a compact JSON object (no markdown, no prose) matching exactly:
{"text": string, "intent": string, "confidence": number, "escalate": boolean}
- text: the SMS reply to send to the customer, plain text.
- intent: a short lowercase label for what the customer wants (e.g. "pricing", "booking", "support", "greeting", "other").
- confidence: 0 to 1 — how confident you are this reply is correct and safe to send.
- escalate: true if a human should handle this instead (anger, legal, complaints, payment disputes, or anything you are unsure about or not allowed to answer).`;

export function buildSystemPrompt(settings = {}, contact = {}) {
  const persona = settings.persona || {};
  const vars = buildContactTemplateVariables(contact);
  const lines = [];

  const business = persona.businessName || "our business";
  const role = persona.role || "a helpful SMS assistant";
  lines.push(`You are ${role} for ${business}. You reply to customers over SMS.`);

  if (persona.tone) {
    lines.push(`Tone: ${persona.tone}.`);
  }

  if (persona.systemInstructions) {
    lines.push("");
    lines.push(renderTemplate(persona.systemInstructions, vars));
  }

  const dos = (persona.doRules || []).filter(Boolean);
  if (dos.length) {
    lines.push("", "Always:");
    dos.forEach((r) => lines.push(`- ${r}`));
  }

  const donts = (persona.dontRules || []).filter(Boolean);
  if (donts.length) {
    lines.push("", "Never:");
    donts.forEach((r) => lines.push(`- ${r}`));
  }

  const faq = (persona.faq || []).filter((f) => f && f.question);
  if (faq.length) {
    lines.push("", "Answer from this FAQ when relevant:");
    faq.forEach((f) => lines.push(`Q: ${f.question}\nA: ${f.answer || ""}`));
  }

  const blocked = (settings.blockedTopics || []).filter(Boolean);
  if (blocked.length) {
    lines.push("", `Refuse and escalate if asked about: ${blocked.join(", ")}.`);
  }

  if (persona.fallbackMessage) {
    lines.push(
      "",
      `If you cannot help or are unsure, set escalate=true and use this as the text: "${persona.fallbackMessage}"`
    );
  }

  const language =
    persona.language && persona.language !== "auto"
      ? `Always reply in ${persona.language}.`
      : "Reply in the same language as the customer.";
  lines.push("", language);

  const maxChars = settings.messageFormat?.maxChars || 160;
  lines.push(`Keep the reply under ${maxChars} characters when possible.`);

  lines.push("", OUTPUT_CONTRACT);

  return lines.join("\n");
}

// Map stored conversation history + the latest inbound into chat messages.
// history: array of { direction: "inbound"|"outbound", body: string }.
export function buildMessages(history = [], inboundText = "", options = {}) {
  const depth = Number(options.memoryDepth) || DEFAULT_MEMORY_DEPTH;

  const messages = history
    .slice(-depth)
    .map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: String(m.body || "").trim(),
    }))
    .filter((m) => m.content);

  // Ensure the latest inbound is the final user turn (history may or may not
  // already include it).
  const text = String(inboundText || "").trim();
  if (text) {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || last.content !== text) {
      messages.push({ role: "user", content: text });
    }
  }

  return messages;
}
