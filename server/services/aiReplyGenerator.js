// aiReplyGenerator.js → orchestrates a single AI reply generation.
//
// Builds the prompt (promptBuilder) → calls the provider (lazy-loaded) →
// validates the output (responseParser). Returns a structured reply and does
// NOT send anything — sending/guardrails are the worker's job (Phase 4).
//
// The provider call is injectable (deps.callModel) and the default lazily
// imports the SDK, so this module and its pure deps can be unit-tested against
// sample inbounds without the OpenAI package installed or any network call.

import { buildSystemPrompt, buildMessages } from "./ai/promptBuilder.js";
import { parseAiReply } from "./ai/responseParser.js";
import { decryptSecret } from "../utils/secretBox.js";

// Resolve the API key: an explicit key in settings wins (decrypted from its
// at-rest form; plaintext passes through), else the provider's env var
// (OPENAI_API_KEY, GEMINI_API_KEY, …).
export function resolveApiKey(settings = {}) {
  if (settings.apiKey) return decryptSecret(settings.apiKey);
  const provider = settings.provider || "openai";
  return process.env[`${provider.toUpperCase()}_API_KEY`] || "";
}

async function defaultCallModel({ provider, apiKey, model, system, messages }) {
  if ((provider || "openai") !== "openai") {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  const { callOpenAI } = await import("./ai/openaiProvider.js");
  return callOpenAI({ apiKey, model, system, messages });
}

export async function generateAiReply(
  { settings = {}, contact = {}, history = [], inboundText = "" },
  deps = {}
) {
  const callModel = deps.callModel || defaultCallModel;

  const system = buildSystemPrompt(settings, contact);
  const messages = buildMessages(history, inboundText);

  const provider = settings.provider || "openai";
  const model = settings.model || "gpt-4o-mini";
  const apiKey = resolveApiKey(settings);

  const raw = await callModel({ provider, apiKey, model, system, messages });
  const parsed = parseAiReply(raw);

  return { ...parsed, provider, model };
}
