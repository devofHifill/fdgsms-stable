// aiSettingsController.js → REST for the single AI Reply System settings doc.
//
// GET never returns the raw apiKey (masked). PUT is write-only for the key:
// it is encrypted at rest and only overwritten when a real new value arrives.

import AiSettings from "../models/AiSettings.js";
import { createSystemLog } from "../services/systemLogService.js";
import { encryptSecret, maskSecret } from "../utils/secretBox.js";

const REPLY_MODES = ["off", "draft", "auto", "hybrid"];
const TOO_LONG = ["regenerate", "truncate"];
const CAP_HIT = ["escalate", "fallback", "silent"];

// Shape the settings for the client: strip the raw key, add a masked hint.
function toClient(doc) {
  const obj = doc.toObject();
  const hasApiKey = Boolean(obj.apiKey);
  delete obj.apiKey;
  return { ...obj, hasApiKey, apiKeyMasked: hasApiKey ? maskSecret(doc.apiKey) : "" };
}

async function loadOrCreate() {
  let item = await AiSettings.findOne({ key: "default" });
  if (!item) item = await AiSettings.create({ key: "default" });
  return item;
}

export async function getSettings(req, res) {
  try {
    const item = await loadOrCreate();
    return res.status(200).json(toClient(item));
  } catch (error) {
    console.error("getSettings error:", error);
    return res.status(500).json({ message: "Failed to fetch AI settings" });
  }
}

export async function updateSettings(req, res) {
  try {
    const body = req.body || {};
    const item = await loadOrCreate();

    // --- master controls ---
    if (body.enabled !== undefined) item.enabled = Boolean(body.enabled);

    if (body.replyMode !== undefined) {
      if (!REPLY_MODES.includes(body.replyMode)) {
        return res.status(400).json({ message: `replyMode must be one of ${REPLY_MODES.join(", ")}` });
      }
      item.replyMode = body.replyMode;
    }

    if (body.defaultContactAiEnabled !== undefined) {
      item.defaultContactAiEnabled = Boolean(body.defaultContactAiEnabled);
    }

    if (Array.isArray(body.activePhoneNumbers)) {
      item.activePhoneNumbers = body.activePhoneNumbers.map((n) => String(n).trim()).filter(Boolean);
    }

    // --- provider / model / key ---
    if (body.provider !== undefined) item.provider = String(body.provider).trim();
    if (body.model !== undefined) item.model = String(body.model).trim();

    // apiKey is write-only: only overwrite on a real new value (ignore blanks
    // and the masked placeholder the client may echo back).
    if (typeof body.apiKey === "string") {
      const trimmed = body.apiKey.trim();
      if (trimmed && !trimmed.startsWith("•")) {
        item.apiKey = encryptSecret(trimmed);
      }
    }
    if (body.clearApiKey === true) item.apiKey = "";

    // --- persona ---
    if (body.persona && typeof body.persona === "object") {
      const p = body.persona;
      const fields = ["businessName", "role", "tone", "systemInstructions", "fallbackMessage", "signature", "language"];
      for (const f of fields) {
        if (p[f] !== undefined) item.persona[f] = String(p[f]);
      }
      if (Array.isArray(p.doRules)) item.persona.doRules = p.doRules.map(String);
      if (Array.isArray(p.dontRules)) item.persona.dontRules = p.dontRules.map(String);
      if (Array.isArray(p.faq)) {
        item.persona.faq = p.faq.map((f) => ({
          question: String(f?.question || ""),
          answer: String(f?.answer || ""),
        }));
      }
    }

    // --- message format ---
    if (body.messageFormat && typeof body.messageFormat === "object") {
      const mf = body.messageFormat;
      if (mf.maxChars !== undefined) {
        const n = Number(mf.maxChars);
        if (!Number.isFinite(n) || n < 1) return res.status(400).json({ message: "maxChars must be >= 1" });
        item.messageFormat.maxChars = n;
      }
      if (mf.maxSegments !== undefined) {
        const n = Number(mf.maxSegments);
        if (!Number.isFinite(n) || n < 1) return res.status(400).json({ message: "maxSegments must be >= 1" });
        item.messageFormat.maxSegments = n;
      }
      if (mf.onTooLong !== undefined) {
        if (!TOO_LONG.includes(mf.onTooLong)) return res.status(400).json({ message: `onTooLong must be one of ${TOO_LONG.join(", ")}` });
        item.messageFormat.onTooLong = mf.onTooLong;
      }
      if (mf.stripNonGsm !== undefined) item.messageFormat.stripNonGsm = Boolean(mf.stripNonGsm);
    }

    // --- volume limits ---
    if (body.volumeLimits && typeof body.volumeLimits === "object") {
      const vl = body.volumeLimits;
      if (vl.maxRepliesWithoutHuman !== undefined) {
        const n = Number(vl.maxRepliesWithoutHuman);
        if (!Number.isFinite(n) || n < 1) return res.status(400).json({ message: "maxRepliesWithoutHuman must be >= 1" });
        item.volumeLimits.maxRepliesWithoutHuman = n;
      }
      if (vl.maxPerConversationPerDay !== undefined) {
        const n = Number(vl.maxPerConversationPerDay);
        if (!Number.isFinite(n) || n < 1) return res.status(400).json({ message: "maxPerConversationPerDay must be >= 1" });
        item.volumeLimits.maxPerConversationPerDay = n;
      }
      if (vl.neverDoubleText !== undefined) item.volumeLimits.neverDoubleText = Boolean(vl.neverDoubleText);
      if (vl.onCapHit !== undefined) {
        if (!CAP_HIT.includes(vl.onCapHit)) return res.status(400).json({ message: `onCapHit must be one of ${CAP_HIT.join(", ")}` });
        item.volumeLimits.onCapHit = vl.onCapHit;
      }
    }

    // --- safety / quality ---
    if (Array.isArray(body.escalationKeywords)) item.escalationKeywords = body.escalationKeywords.map(String);
    if (Array.isArray(body.blockedTopics)) item.blockedTopics = body.blockedTopics.map(String);
    if (body.minConfidenceToSend !== undefined) {
      const n = Number(body.minConfidenceToSend);
      if (!Number.isFinite(n) || n < 0 || n > 1) return res.status(400).json({ message: "minConfidenceToSend must be between 0 and 1" });
      item.minConfidenceToSend = n;
    }
    if (body.retryLimit !== undefined) {
      const n = Number(body.retryLimit);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "retryLimit must be >= 0" });
      item.retryLimit = n;
    }

    await item.save();

    await createSystemLog({
      level: "info",
      category: "ai",
      event: "ai_settings_updated",
      message: "AI settings updated",
      metadata: { enabled: item.enabled, replyMode: item.replyMode, provider: item.provider, model: item.model },
    });

    return res.status(200).json({ message: "AI settings updated", ...toClient(item) });
  } catch (error) {
    console.error("updateSettings error:", error);
    return res.status(500).json({ message: "Failed to update AI settings" });
  }
}
