// Campaign plan C6: one campaign's report — contacts, delivery per step and
// per day, top error codes, estimated finish and cost (Twilio prices).
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

const DAY_OPTIONS = [7, 14, 30];

function formatDate(value, timeZone, withTime = false) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function shortDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
}

function money(value, unit = "USD") {
  if (value === null || value === undefined) return "—";
  const digits = value > 0 && value < 1 ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: unit || "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${unit}`;
  }
}

function pct(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

function statusOf(c) {
  if (c.state === "stopped") return { label: "Stopped", cls: "badge-gray" };
  if (c.state === "completed") return { label: "Completed", cls: "badge-gray" };
  if (!c.isActive) return { label: "Paused", cls: "badge-orange" };
  if (c.state === "finishing") return { label: "Finishing", cls: "badge-blue" };
  return { label: "Running", cls: "badge-green" };
}

const BASIS_TEXT = {
  target: "at the daily target",
  recent: "at the last 7 days' pace",
  gap: "at the most the gap allows",
  target_capped_by_gap: "at the most the gap allows (lower than the target)",
  recent_capped_by_gap: "at the most the gap allows",
  gap_capped_by_gap: "at the most the gap allows",
};

function EstimateText({ estimate, tz }) {
  const e = estimate || {};
  switch (e.status) {
    case "stopped":
      return <p>Stopped — nothing more will be sent.</p>;
    case "completed":
      return <p>Completed.</p>;
    case "done":
      return <p>Every contact has finished.</p>;
    case "unknown":
      return <p className="muted">Not enough to estimate yet ({e.notStarted} contact(s) waiting for step 1).</p>;
    case "followUpsOnly":
      return (
        <p>
          Every contact has had step 1{e.wontStart ? ` (${e.wontStart} won't start: the campaign is finishing)` : ""}.
          Last follow-ups around <strong>{formatDate(e.finishAt, tz)}</strong>.
        </p>
      );
    case "paused":
    case "estimated":
    default:
      return (
        <>
          {e.status === "paused" ? <p className="report-warn">Paused — the estimate assumes you resume today.</p> : null}
          <p>
            Step 1 reaches the last of <strong>{e.notStarted}</strong> waiting contact(s) around{" "}
            <strong>{formatDate(e.step1DoneAt, tz)}</strong> ({e.sendingDaysNeeded} sending day(s){" "}
            {BASIS_TEXT[e.basis] || ""}, ~{e.perDay}/day).
          </p>
          <p>
            Last follow-up step around <strong>{formatDate(e.finishAt, tz)}</strong>.
          </p>
          {e.cappedByEnd ? (
            <p className="report-warn">
              The campaign's end rule comes first: about {e.wontStart} contact(s) won't get step 1.
            </p>
          ) : null}
        </>
      );
  }
}

export default function CampaignReportPage() {
  const { id } = useParams();
  const [days, setDays] = useState(14);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setReport(await apiFetch(`/campaigns/${id}/report?days=${days}`));
    } catch (err) {
      setError(err.message || "Failed to load the report");
    } finally {
      setLoading(false);
    }
  }, [id, days]);

  useEffect(() => {
    load();
  }, [load]);

  const r = report;
  const tz = r?.timezone;
  const maxDay = r ? Math.max(1, ...r.perDay.map((d) => d.sent)) : 1;
  const status = r ? statusOf(r.campaign) : null;

  return (
    <AppLayout>
      <div className="campaign-report-page">
        <div className="page-header-row">
          <div>
            <p className="report-back">
              <Link to="/campaigns">← Campaigns</Link>
            </p>
            <h1>
              {r ? r.campaign.name : "Campaign report"}{" "}
              {status ? <span className={status.cls}>{status.label}</span> : null}
            </h1>
            {r ? (
              <p>
                {r.campaign.stepCount} step(s) · created {formatDate(r.campaign.createdAt, tz)} · times in {tz}
              </p>
            ) : null}
          </div>
          <div className="report-controls">
            <label>
              Days shown{" "}
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    Last {d} days
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary-button" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {error ? <p className="status-error">{error}</p> : null}
        {!r && loading ? <p className="muted">Loading report…</p> : null}

        {r ? (
          <>
            <div className="report-stats">
              <div className="stat-card">
                <span>Contacts</span>
                <strong>{r.contacts.total}</strong>
                <small>
                  {r.contacts.notStarted} waiting · {r.contacts.inProgress} in progress · {r.contacts.completed} completed
                </small>
              </div>
              <div className="stat-card">
                <span>Texts sent</span>
                <strong>{r.totals.sent}</strong>
                <small>
                  {r.totals.delivered} delivered · {r.totals.undelivered} undelivered · {r.totals.waiting} waiting
                </small>
              </div>
              <div className="stat-card">
                <span>Delivery rate</span>
                <strong>{pct(r.totals.deliveryRate)}</strong>
                <small>{r.totals.noReport} with no delivery report</small>
              </div>
              <div className="stat-card">
                <span>Cost</span>
                <strong>{money(r.cost.total, r.cost.unit)}</strong>
                <small>
                  {r.cost.perDelivered !== null ? `${money(r.cost.perDelivered, r.cost.unit)} per delivered` : "No prices yet"}
                  {r.cost.unpricedTexts ? ` · ${r.cost.unpricedTexts} text(s) not priced yet` : ""}
                </small>
              </div>
            </div>

            <div className="report-grid">
              <section className="card">
                <h2>Estimated finish</h2>
                <EstimateText estimate={r.estimate} tz={tz} />
                <p className="muted report-small">
                  Gap allows up to {r.estimate.capacityPerDay} text(s) a day in the sending window
                  {r.campaign.dailyStep1Target ? ` · target ${r.campaign.dailyStep1Target} step-1 delivered a day` : ""}
                  {` · last 7 days ${r.estimate.recentPerDay} step-1 delivered a sending day`}
                  {r.campaign.endsAt ? ` · stops taking new contacts ${formatDate(r.campaign.endsAt, tz, true)}` : ""}
                </p>
              </section>

              <section className="card">
                <h2>Contacts</h2>
                <dl className="report-list">
                  <dt>Waiting for step 1</dt><dd>{r.contacts.notStarted}</dd>
                  <dt>In progress</dt><dd>{r.contacts.inProgress}</dd>
                  <dt>Completed every step</dt><dd>{r.contacts.completed}</dd>
                  <dt>Replied</dt><dd>{r.contacts.replied}</dd>
                  <dt>Opted out</dt><dd>{r.contacts.optedOut}</dd>
                  <dt>Removed after an undelivered text</dt><dd>{r.contacts.excludedUndelivered}</dd>
                  <dt>Skipped (on do-not-text list)</dt><dd>{r.contacts.skippedDoNotText}</dd>
                  <dt>Cancelled (no delivery report in 24 h)</dt><dd>{r.contacts.noDeliveryReport}</dd>
                  <dt>Stopped with the campaign</dt><dd>{r.contacts.campaignStopped}</dd>
                  {r.contacts.otherStopped ? (<><dt>Stopped (other reasons)</dt><dd>{r.contacts.otherStopped}</dd></>) : null}
                </dl>
              </section>
            </div>

            <section className="card">
              <h2>Per step</h2>
              <div className="table-scroll">
                <table className="logs-table report-table">
                  <thead>
                    <tr>
                      <th>Step</th><th>Text</th><th>Sent</th><th>Delivered</th><th>Undelivered</th>
                      <th>Waiting</th><th>No report</th><th>Delivery rate</th><th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.steps.map((s) => (
                      <tr key={s.stepNumber}>
                        <td>{s.stepNumber}</td>
                        <td className="report-body" title={s.body}>{s.body}</td>
                        <td>{s.sent}</td><td>{s.delivered}</td><td>{s.undelivered}</td>
                        <td>{s.waiting}</td><td>{s.noReport}</td><td>{pct(s.deliveryRate)}</td>
                        <td>{money(s.cost, r.cost.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <h2>Per day</h2>
              <div className="report-bars" role="img" aria-label="Texts sent per day">
                {r.perDay.map((d) => (
                  <div key={d.day} className="report-bar" title={`${shortDay(d.day)}: ${d.sent} sent, ${d.delivered} delivered, ${d.undelivered} undelivered`}>
                    <div className="report-bar-stack" style={{ height: `${(d.sent / maxDay) * 100}%` }}>
                      <div className="bar-undelivered" style={{ flexGrow: d.undelivered }} />
                      <div className="bar-pending" style={{ flexGrow: d.waiting + d.noReport }} />
                      <div className="bar-delivered" style={{ flexGrow: d.delivered }} />
                    </div>
                    <span>{shortDay(d.day)}</span>
                  </div>
                ))}
              </div>
              <p className="report-legend">
                <i className="bar-delivered" /> delivered <i className="bar-pending" /> waiting / no report{" "}
                <i className="bar-undelivered" /> undelivered
              </p>
              <div className="table-scroll">
                <table className="logs-table report-table">
                  <thead>
                    <tr>
                      <th>Day</th><th>Sent</th><th>Delivered</th><th>Undelivered</th><th>Waiting / no report</th>
                      <th>Step 1 delivered</th><th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...r.perDay].reverse().map((d) => (
                      <tr key={d.day}>
                        <td>{shortDay(d.day)}</td><td>{d.sent}</td><td>{d.delivered}</td><td>{d.undelivered}</td>
                        <td>{d.waiting + d.noReport}</td><td>{d.step1Delivered}</td><td>{money(d.cost, r.cost.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <h2>Top error codes</h2>
              {r.errors.length ? (
                <table className="logs-table report-table">
                  <thead>
                    <tr><th>Code</th><th>Meaning</th><th>Texts</th><th>Share of undelivered</th></tr>
                  </thead>
                  <tbody>
                    {r.errors.map((e) => (
                      <tr key={e.code || "none"}>
                        <td>{e.code || "—"}</td><td>{e.label}</td><td>{e.count}</td><td>{e.share}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No undelivered texts.</p>
              )}
            </section>

            <p className="muted report-small">
              Cost is what Twilio charged per text; prices are looked up a few minutes after sending.
              Updated {formatDate(r.generatedAt, tz, true)}.
            </p>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
