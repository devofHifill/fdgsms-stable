// openaiProvider.js → the only file that imports the OpenAI SDK.
//
// Sends the system prompt + messages to OpenAI and returns the raw JSON string
// from the model (parsed downstream by responseParser). Kept isolated so other
// providers (Gemini, …) can be added as sibling modules and selected by
// AiSettings.provider.

import OpenAI from "openai";

export async function callOpenAI({ apiKey, model, system, messages, temperature = 0.4 }) {
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: model || "gpt-4o-mini",
    temperature,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, ...messages],
  });

  return response.choices?.[0]?.message?.content || "";
}
