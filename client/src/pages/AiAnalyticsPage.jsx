import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

function fmtWhen(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function dotClass(level) {
  if (level === "error") return "audit-dot is-error";
  if (level === "warn") return "audit-dot is-warn";
  return "audit-dot is-info";
}

export default function AiAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Test / preview
  const [testText, setTestText] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");

  async function load(range) {
    try {
      setLoading(true);
      setError("");
      const [a, l] = await Promise.all([
        apiFetch(`/ai/analytics?days=${range}`),
        apiFetch("/logs?category=ai&limit=15"),
      ]);
      setMetrics(a.metrics || null);
      setLogs(l.items || []);
    } catch (err) {
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeRange(e) {
    const r = Number(e.target.value);
    setDays(r);
    load(r);
  }

  async function runTest(e) {
    e.preventDefault();
    if (!testText.trim()) return;
    try {
      setTesting(true);
      setTestError("");
      setTestResult(null);
      const data = await apiFetch("/ai/test-reply", {
        method: "POST",
        body: JSON.stringify({ inboundText: testText.trim() }),
      });
      setTestResult(data.reply || null);
    } catch (err) {
      setTestError(err.message || "Test failed");
    } finally {
      setTesting(false);
    }
  }

  const m = metrics || {};
  const cards = [
    { n: m.totalJobs ?? 0, l: "AI jobs" },
    { n: m.sent ?? 0, l: "Auto-sent" },
    { n: m.drafted ?? 0, l: "Drafted" },
    { n: m.escalated ?? 0, l: "Escalated" },
    { n: m.aiMessagesSent ?? 0, l: "AI messages sent" },
    { n: `${m.handoffRate ?? 0}%`, l: "Handoff rate" },
    { n: `${m.escalationRate ?? 0}%`, l: "Escalation rate" },
    { n: m.avgConfidence ?? 0, l: "Avg confidence" },
    { n: m.optOuts ?? 0, l: "Opt-outs" },
    { n: m.failed ?? 0, l: "Failed" },
  ];

  return (
    <AppLayout>
      <div className="campaigns-page">
        <div className="page-header-row">
          <div>
            <h1>AI Analytics</h1>
            <p>Reply activity, handoffs, and a no-send prompt tester.</p>
          </div>
          <select value={days} onChange={changeRange} disabled={loading}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {error ? <p className="status-error">{error}</p> : null}

        {loading ? (
          <p>Loading analytics...</p>
        ) : (
          <div className="ai-metrics">
            {cards.map((c) => (
              <div key={c.l} className="ai-metric">
                <div className="n">{c.n}</div>
                <div className="l">{c.l}</div>
              </div>
            ))}
          </div>
        )}

        <section className="card settings-card">
          <h2>Test the AI reply</h2>
          <p className="muted">
            Type a sample inbound message and see what the AI would reply — nothing is sent.
          </p>
          <form className="campaign-form" onSubmit={runTest}>
            <label className="field-block">
              <span>Sample inbound message</span>
              <textarea
                rows="3"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="e.g. what are your hours?"
              />
            </label>
            {testError ? <p className="status-error">{testError}</p> : null}
            <div className="form-actions">
              <button type="submit" disabled={testing || !testText.trim()}>
                {testing ? "Generating..." : "Test reply"}
              </button>
            </div>
          </form>

          {testResult ? (
            <div className="ai-test-result">
              <div className="ai-test-reply">{testResult.text || "(no reply text)"}</div>
              <div className="ai-test-meta">
                <span className="status-badge status-info">
                  intent: {testResult.intent || "-"}
                </span>
                <span className="status-badge status-active">
                  confidence:{" "}
                  {typeof testResult.confidence === "number"
                    ? `${Math.round(testResult.confidence * 100)}%`
                    : "-"}
                </span>
                <span
                  className={`status-badge ${testResult.escalate ? "status-error" : "status-active"}`}
                >
                  {testResult.escalate ? "would escalate to human" : "would reply"}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card settings-card">
          <h2>Recent AI activity</h2>
          {logs.length ? (
            <div className="ai-audit">
              {logs.map((log) => (
                <div key={log._id} className="ai-audit-row">
                  <span className={dotClass(log.level)} />
                  <span className="ai-audit-event">{log.event}</span>
                  <span className="ai-audit-msg">{log.message}</span>
                  <span className="ai-audit-when">{fmtWhen(log.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No AI activity yet.</p>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
