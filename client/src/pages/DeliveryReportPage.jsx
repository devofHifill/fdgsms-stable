import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

// Common Twilio message error codes → plain-English meaning.
const ERR = {
  "30001": "Queue overflow",
  "30002": "Account suspended",
  "30003": "Unreachable handset (off / no signal)",
  "30004": "Message blocked",
  "30005": "Unknown or inactive number",
  "30006": "Landline or unreachable carrier",
  "30007": "Carrier filtered (spam)",
  "30008": "Unknown delivery error",
  "21211": "Invalid 'To' phone number",
  "21610": "Recipient opted out (STOP)",
  "21614": "Not a valid mobile number",
};

function errMeaning(code) {
  return ERR[code] || "Carrier / delivery error";
}

function fmtWhen(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function DeliveryReportPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(range) {
    try {
      setLoading(true);
      setError("");
      const d = await apiFetch(`/messages/delivery-report?days=${range}`);
      setData(d);
    } catch (err) {
      setError(err.message || "Failed to load delivery report");
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

  async function unblock(contactId) {
    try {
      setBusyId(contactId);
      setError("");
      await apiFetch(`/messages/delivery-unblock/${contactId}`, { method: "PATCH" });
      await load(days);
    } catch (err) {
      setError(err.message || "Failed to unblock");
    } finally {
      setBusyId("");
    }
  }

  const d = data || {};
  const s = d.byStatus || {};
  const cards = [
    { n: `${d.deliveryRate ?? 0}%`, l: "Delivery rate" },
    { n: d.totalOutbound ?? 0, l: "Total outbound" },
    { n: s.delivered ?? 0, l: "Delivered" },
    { n: s.sent ?? 0, l: "Sent (awaiting receipt)" },
    { n: s.undelivered ?? 0, l: "Undelivered" },
    { n: s.failed ?? 0, l: "Failed" },
    { n: d.blockedCount ?? 0, l: "Blocked numbers" },
  ];

  return (
    <AppLayout>
      <div className="campaigns-page">
        <div className="page-header-row">
          <div>
            <h1>SMS Delivery</h1>
            <p>Delivery status and carrier error breakdown from Twilio.</p>
          </div>
          <select value={days} onChange={changeRange} disabled={loading}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {error ? <p className="status-error">{error}</p> : null}

        {loading ? (
          <p>Loading delivery report...</p>
        ) : (
          <>
            <div className="ai-metrics">
              {cards.map((c) => (
                <div key={c.l} className="ai-metric">
                  <div className="n">{c.n}</div>
                  <div className="l">{c.l}</div>
                </div>
              ))}
            </div>

            <section className="card settings-card">
              <h2>Top error codes</h2>
              {d.errorCodes?.length ? (
                <table className="preview-table">
                  <thead>
                    <tr><th>Code</th><th>Meaning</th><th>Count</th></tr>
                  </thead>
                  <tbody>
                    {d.errorCodes.map((e) => (
                      <tr key={e.code}>
                        <td>{e.code}</td>
                        <td>{errMeaning(e.code)}</td>
                        <td>{e.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No delivery errors in this range.</p>
              )}
            </section>

            <section className="card settings-card">
              <h2>Blocked numbers</h2>
              <p className="muted">
                Auto-blocked after a failed delivery — no further SMS are sent to them. Unblock to allow sending again.
              </p>
              {d.blockedContacts?.length ? (
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Phone</th><th>Last error</th><th>Fails</th><th>Since</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.blockedContacts.map((c) => (
                      <tr key={c._id}>
                        <td>{c.fullName || "-"}</td>
                        <td>{c.normalizedPhone || c.phone || "-"}</td>
                        <td>
                          {c.lastDeliveryErrorCode
                            ? `${c.lastDeliveryErrorCode} — ${errMeaning(c.lastDeliveryErrorCode)}`
                            : c.lastDeliveryStatus || "-"}
                        </td>
                        <td>{c.deliveryFailureCount ?? 0}</td>
                        <td>{fmtWhen(c.deliveryBlockedAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => unblock(c._id)}
                            disabled={busyId === c._id}
                          >
                            {busyId === c._id ? "..." : "Unblock"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No blocked numbers.</p>
              )}
            </section>

            <section className="card settings-card">
              <h2>Recent failures</h2>
              {d.recentFailures?.length ? (
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Phone</th><th>Status</th><th>Error</th><th>Type</th><th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recentFailures.map((m) => (
                      <tr key={m._id}>
                        <td>{m.normalizedPhone || m.phone || "-"}</td>
                        <td>
                          <span className={`status-badge status-${m.status}`}>{m.status}</span>
                        </td>
                        <td>
                          {m.errorCode
                            ? `${m.errorCode} — ${errMeaning(m.errorCode)}`
                            : "-"}
                        </td>
                        <td>{m.messageType || "-"}</td>
                        <td>{fmtWhen(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No recent failures.</p>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
