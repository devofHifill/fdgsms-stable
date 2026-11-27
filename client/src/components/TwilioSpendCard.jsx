// Campaign plan C7: Twilio spend today / this month (whole account).
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api";

function money(value, unit = "USD") {
  const n = Number(value) || 0;
  const digits = n > 0 && n < 1 ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: unit || "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${n.toFixed(digits)} ${unit}`;
  }
}

function Period({ title, data }) {
  if (!data) return null;
  return (
    <div className="spend-period">
      <div className="spend-head">
        <span>{title}</span>
        <strong>{money(data.total, data.unit)}</strong>
      </div>
      <dl className="spend-lines">
        {data.lines.map((l) => (
          <div key={l.key}>
            <dt>
              {l.label}
              {l.count ? <small> · {Number(l.count).toLocaleString()}</small> : null}
            </dt>
            <dd>{money(l.price, data.unit)}</dd>
          </div>
        ))}
        {data.other ? (
          <div>
            <dt>Other (fees, calls, etc.)</dt>
            <dd>{money(data.other, data.unit)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export default function TwilioSpendCard() {
  const [spend, setSpend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError("");
      setSpend(await apiFetch(`/twilio-settings/spend${refresh ? "?refresh=1" : ""}`));
    } catch (err) {
      setError(err.message || "Failed to load Twilio spend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fetched = spend?.fetchedAt
    ? new Date(spend.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className="card spend-card">
      <div className="card-head">
        <div>
          <div className="card-title">Twilio spend</div>
          <div className="card-sub">Whole Twilio account, from Twilio&apos;s usage records</div>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => load(true)}
          disabled={loading}
          style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="status-error">{error}</p> : null}
      {spend && !spend.ok ? <p className="muted">{spend.message}</p> : null}
      {!spend && loading ? <p className="muted">Loading…</p> : null}

      {spend?.ok ? (
        <>
          <div className="spend-grid">
            <Period title="Today" data={spend.today} />
            <Period title="This month" data={spend.thisMonth} />
          </div>
          <p className="muted spend-note">
            Twilio&apos;s day and month run on UTC (a new day starts at 7 PM Eastern, 8 PM in summer), and its usage can
            lag a few minutes. Includes anything else on the same Twilio account. Updated {fetched}.
          </p>
        </>
      ) : null}
    </div>
  );
}
