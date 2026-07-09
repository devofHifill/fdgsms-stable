import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

const REPLY_MODES = [
  { value: "off", label: "Off — never reply" },
  { value: "draft", label: "Draft — human approves" },
  { value: "auto", label: "Auto — send automatically" },
  { value: "hybrid", label: "Hybrid — auto if confident, else draft" },
];
const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic Claude" },
];
const TOO_LONG = [
  { value: "regenerate", label: "Regenerate shorter" },
  { value: "truncate", label: "Truncate" },
];
const CAP_HIT = [
  { value: "escalate", label: "Escalate to human" },
  { value: "fallback", label: "Send fallback message" },
  { value: "silent", label: "Do nothing" },
];

const linesToArray = (s) =>
  String(s || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const arrayToLines = (a) => (Array.isArray(a) ? a.join("\n") : "");
const csvToArray = (s) =>
  String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const EMPTY = {
  enabled: false,
  replyMode: "draft",
  defaultContactAiEnabled: true,
  activePhoneNumbers: "",
  provider: "openai",
  model: "gpt-4o-mini",
  persona: {
    businessName: "",
    role: "",
    tone: "",
    systemInstructions: "",
    fallbackMessage: "",
    signature: "",
    language: "auto",
    doRules: "",
    dontRules: "",
    faq: [],
  },
  messageFormat: { maxChars: 160, maxSegments: 1, onTooLong: "regenerate", stripNonGsm: true },
  volumeLimits: { maxRepliesWithoutHuman: 5, neverDoubleText: true, maxPerConversationPerDay: 10, onCapHit: "escalate" },
  escalationKeywords: "",
  blockedTopics: "",
  minConfidenceToSend: 0.6,
  retryLimit: 2,
};

export default function AiSettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyMeta, setApiKeyMeta] = useState({ hasApiKey: false, apiKeyMasked: "" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const setField = (path, value) =>
    setForm((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });

  async function load() {
    try {
      setLoading(true);
      setError("");
      const d = await apiFetch("/ai/settings");
      const p = d.persona || {};
      setForm({
        enabled: Boolean(d.enabled),
        replyMode: d.replyMode || "draft",
        defaultContactAiEnabled: Boolean(d.defaultContactAiEnabled),
        activePhoneNumbers: (d.activePhoneNumbers || []).join(", "),
        provider: d.provider || "openai",
        model: d.model || "gpt-4o-mini",
        persona: {
          businessName: p.businessName || "",
          role: p.role || "",
          tone: p.tone || "",
          systemInstructions: p.systemInstructions || "",
          fallbackMessage: p.fallbackMessage || "",
          signature: p.signature || "",
          language: p.language || "auto",
          doRules: arrayToLines(p.doRules),
          dontRules: arrayToLines(p.dontRules),
          faq: Array.isArray(p.faq) ? p.faq : [],
        },
        messageFormat: {
          maxChars: d.messageFormat?.maxChars ?? 160,
          maxSegments: d.messageFormat?.maxSegments ?? 1,
          onTooLong: d.messageFormat?.onTooLong || "regenerate",
          stripNonGsm: Boolean(d.messageFormat?.stripNonGsm),
        },
        volumeLimits: {
          maxRepliesWithoutHuman: d.volumeLimits?.maxRepliesWithoutHuman ?? 5,
          neverDoubleText: Boolean(d.volumeLimits?.neverDoubleText),
          maxPerConversationPerDay: d.volumeLimits?.maxPerConversationPerDay ?? 10,
          onCapHit: d.volumeLimits?.onCapHit || "escalate",
        },
        escalationKeywords: (d.escalationKeywords || []).join(", "),
        blockedTopics: (d.blockedTopics || []).join(", "),
        minConfidenceToSend: d.minConfidenceToSend ?? 0.6,
        retryLimit: d.retryLimit ?? 2,
      });
      setApiKeyMeta({ hasApiKey: Boolean(d.hasApiKey), apiKeyMasked: d.apiKeyMasked || "" });
      setApiKeyInput("");
    } catch (err) {
      setError(err.message || "Failed to load AI settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        enabled: form.enabled,
        replyMode: form.replyMode,
        defaultContactAiEnabled: form.defaultContactAiEnabled,
        activePhoneNumbers: csvToArray(form.activePhoneNumbers),
        provider: form.provider,
        model: form.model.trim(),
        persona: {
          businessName: form.persona.businessName,
          role: form.persona.role,
          tone: form.persona.tone,
          systemInstructions: form.persona.systemInstructions,
          fallbackMessage: form.persona.fallbackMessage,
          signature: form.persona.signature,
          language: form.persona.language,
          doRules: linesToArray(form.persona.doRules),
          dontRules: linesToArray(form.persona.dontRules),
          faq: form.persona.faq
            .map((f) => ({ question: (f.question || "").trim(), answer: (f.answer || "").trim() }))
            .filter((f) => f.question),
        },
        messageFormat: {
          maxChars: Number(form.messageFormat.maxChars),
          maxSegments: Number(form.messageFormat.maxSegments),
          onTooLong: form.messageFormat.onTooLong,
          stripNonGsm: form.messageFormat.stripNonGsm,
        },
        volumeLimits: {
          maxRepliesWithoutHuman: Number(form.volumeLimits.maxRepliesWithoutHuman),
          neverDoubleText: form.volumeLimits.neverDoubleText,
          maxPerConversationPerDay: Number(form.volumeLimits.maxPerConversationPerDay),
          onCapHit: form.volumeLimits.onCapHit,
        },
        escalationKeywords: csvToArray(form.escalationKeywords),
        blockedTopics: csvToArray(form.blockedTopics),
        minConfidenceToSend: Number(form.minConfidenceToSend),
        retryLimit: Number(form.retryLimit),
      };

      // Write-only key: only send when a new value was typed.
      if (apiKeyInput.trim()) payload.apiKey = apiKeyInput.trim();

      await apiFetch("/ai/settings", { method: "PUT", body: JSON.stringify(payload) });
      setSuccess("AI settings saved");
      await load();
    } catch (err) {
      setError(err.message || "Failed to save AI settings");
    } finally {
      setSaving(false);
    }
  }

  function addFaq() {
    setForm((prev) => ({
      ...prev,
      persona: { ...prev.persona, faq: [...prev.persona.faq, { question: "", answer: "" }] },
    }));
  }
  function updateFaq(i, key, value) {
    setForm((prev) => {
      const faq = prev.persona.faq.map((f, idx) => (idx === i ? { ...f, [key]: value } : f));
      return { ...prev, persona: { ...prev.persona, faq } };
    });
  }
  function removeFaq(i) {
    setForm((prev) => ({
      ...prev,
      persona: { ...prev.persona, faq: prev.persona.faq.filter((_, idx) => idx !== i) },
    }));
  }

  return (
    <AppLayout>
      <div className="campaigns-page">
        <div className="page-header-row">
          <div>
            <h1>AI Reply System</h1>
            <p>Configure automated, AI-generated replies to inbound SMS.</p>
          </div>
        </div>

        {error ? <p className="status-error">{error}</p> : null}
        {success ? <p className="status-success">{success}</p> : null}

        {loading ? (
          <p>Loading AI settings...</p>
        ) : (
          <form className="campaign-form" onSubmit={handleSubmit}>
            {/* 1 — Master controls */}
            <section className="card settings-card">
              <h2>Master Controls</h2>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setField("enabled", e.target.checked)}
                />
                <span>AI replies enabled (global switch)</span>
              </label>

              <div className="settings-grid">
                <label className="field-block">
                  <span>Reply mode</span>
                  <select value={form.replyMode} onChange={(e) => setField("replyMode", e.target.value)}>
                    {REPLY_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.defaultContactAiEnabled}
                    onChange={(e) => setField("defaultContactAiEnabled", e.target.checked)}
                  />
                  <span>AI on by default for new contacts</span>
                </label>
              </div>

              <label className="field-block">
                <span>Active phone numbers (comma-separated; blank = all)</span>
                <input
                  type="text"
                  placeholder="+15551234567, +15559876543"
                  value={form.activePhoneNumbers}
                  onChange={(e) => setField("activePhoneNumbers", e.target.value)}
                />
              </label>
            </section>

            {/* 5 — Provider / model / key */}
            <section className="card settings-card">
              <h2>Provider & Model</h2>
              <div className="settings-grid">
                <label className="field-block">
                  <span>Provider</span>
                  <select value={form.provider} onChange={(e) => setField("provider", e.target.value)}>
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>

                <label className="field-block">
                  <span>Model</span>
                  <input type="text" placeholder="gpt-4o-mini" value={form.model} onChange={(e) => setField("model", e.target.value)} />
                </label>
              </div>

              <label className="field-block">
                <span>API key</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={apiKeyMeta.hasApiKey ? `Saved (${apiKeyMeta.apiKeyMasked}) — leave blank to keep` : "Enter provider API key (or use server env var)"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
              </label>
              <p className="muted">Stored encrypted. Leave blank to keep the saved key or to fall back to the server env var.</p>
            </section>

            {/* 4 — Persona & knowledge */}
            <section className="card settings-card">
              <h2>Persona & Knowledge</h2>
              <div className="settings-grid">
                <label className="field-block">
                  <span>Business name</span>
                  <input type="text" value={form.persona.businessName} onChange={(e) => setField("persona.businessName", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Role</span>
                  <input type="text" placeholder="a helpful booking assistant" value={form.persona.role} onChange={(e) => setField("persona.role", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Tone</span>
                  <input type="text" value={form.persona.tone} onChange={(e) => setField("persona.tone", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Language</span>
                  <input type="text" placeholder="auto" value={form.persona.language} onChange={(e) => setField("persona.language", e.target.value)} />
                </label>
              </div>

              <label className="field-block">
                <span>System instructions</span>
                <textarea rows="3" value={form.persona.systemInstructions} onChange={(e) => setField("persona.systemInstructions", e.target.value)} />
              </label>

              <div className="settings-grid">
                <label className="field-block">
                  <span>Always (one rule per line)</span>
                  <textarea rows="3" value={form.persona.doRules} onChange={(e) => setField("persona.doRules", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Never (one rule per line)</span>
                  <textarea rows="3" value={form.persona.dontRules} onChange={(e) => setField("persona.dontRules", e.target.value)} />
                </label>
              </div>

              <label className="field-block">
                <span>Fallback message</span>
                <textarea rows="2" value={form.persona.fallbackMessage} onChange={(e) => setField("persona.fallbackMessage", e.target.value)} />
              </label>

              <label className="field-block">
                <span>Signature (appended to sent replies)</span>
                <input type="text" value={form.persona.signature} onChange={(e) => setField("persona.signature", e.target.value)} />
              </label>

              <div className="field-block">
                <span>FAQ</span>
                {form.persona.faq.map((f, i) => (
                  <div key={i} className="settings-grid" style={{ alignItems: "end" }}>
                    <label className="field-block">
                      <span>Question</span>
                      <input type="text" value={f.question} onChange={(e) => updateFaq(i, "question", e.target.value)} />
                    </label>
                    <label className="field-block">
                      <span>Answer</span>
                      <input type="text" value={f.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} />
                    </label>
                    <button type="button" className="btn-secondary" onClick={() => removeFaq(i)}>Remove</button>
                  </div>
                ))}
                <button type="button" className="btn-secondary" onClick={addFaq}>+ Add FAQ</button>
              </div>
            </section>

            {/* 6 — Message format */}
            <section className="card settings-card">
              <h2>Message Format</h2>
              <div className="settings-grid">
                <label className="field-block">
                  <span>Max characters</span>
                  <input type="number" min="1" value={form.messageFormat.maxChars} onChange={(e) => setField("messageFormat.maxChars", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Max segments</span>
                  <input type="number" min="1" value={form.messageFormat.maxSegments} onChange={(e) => setField("messageFormat.maxSegments", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>If too long</span>
                  <select value={form.messageFormat.onTooLong} onChange={(e) => setField("messageFormat.onTooLong", e.target.value)}>
                    {TOO_LONG.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.messageFormat.stripNonGsm} onChange={(e) => setField("messageFormat.stripNonGsm", e.target.checked)} />
                <span>Strip emoji / non-GSM characters</span>
              </label>
            </section>

            {/* 7 — Volume limits */}
            <section className="card settings-card">
              <h2>Conversation Limits</h2>
              <div className="settings-grid">
                <label className="field-block">
                  <span>Max AI replies without a human</span>
                  <input type="number" min="1" value={form.volumeLimits.maxRepliesWithoutHuman} onChange={(e) => setField("volumeLimits.maxRepliesWithoutHuman", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Max messages per conversation/day</span>
                  <input type="number" min="1" value={form.volumeLimits.maxPerConversationPerDay} onChange={(e) => setField("volumeLimits.maxPerConversationPerDay", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>When cap hit</span>
                  <select value={form.volumeLimits.onCapHit} onChange={(e) => setField("volumeLimits.onCapHit", e.target.value)}>
                    {CAP_HIT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.volumeLimits.neverDoubleText} onChange={(e) => setField("volumeLimits.neverDoubleText", e.target.checked)} />
                <span>Never double-text (wait for a reply before sending again)</span>
              </label>
            </section>

            {/* 10 — Safety & quality */}
            <section className="card settings-card">
              <h2>Safety & Quality</h2>
              <div className="settings-grid">
                <label className="field-block">
                  <span>Escalation keywords (comma-separated)</span>
                  <input type="text" placeholder="refund, lawyer, complaint" value={form.escalationKeywords} onChange={(e) => setField("escalationKeywords", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Blocked topics (comma-separated)</span>
                  <input type="text" placeholder="pricing, legal" value={form.blockedTopics} onChange={(e) => setField("blockedTopics", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Min confidence to send (0–1)</span>
                  <input type="number" min="0" max="1" step="0.05" value={form.minConfidenceToSend} onChange={(e) => setField("minConfidenceToSend", e.target.value)} />
                </label>
                <label className="field-block">
                  <span>Retry limit</span>
                  <input type="number" min="0" value={form.retryLimit} onChange={(e) => setField("retryLimit", e.target.value)} />
                </label>
              </div>
            </section>

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save AI Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
