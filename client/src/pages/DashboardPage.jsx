import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../services/api";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

const PATHS = {
  contacts: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  flow: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
};

function Icon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }}
    />
  );
}

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const p = s.split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}

export default function DashboardPage() {
  const { user } = useAuth();

  const [metrics, setMetrics] = useState({
    contacts: 0,
    enrollTotal: 0,
    active: 0,
    completed: 0,
    stopped: 0,
    conversations: 0,
  });
  const [campaigns, setCampaigns] = useState([]);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([
        apiFetch("/contacts?page=1&limit=1"),
        apiFetch("/enrollments"),
        apiFetch("/conversations"),
        apiFetch("/campaigns"),
      ]);

      const [contactsR, enrollR, convoR, campR] = results;
      const next = { ...metrics };

      if (contactsR.status === "fulfilled") {
        next.contacts =
          contactsR.value?.pagination?.total ??
          (contactsR.value?.items?.length || 0);
      }
      if (enrollR.status === "fulfilled") {
        const items = enrollR.value?.items || [];
        next.enrollTotal = items.length;
        next.active = items.filter((x) => x.status === "active").length;
        next.completed = items.filter((x) => x.status === "completed").length;
        next.stopped = items.filter((x) => x.status === "stopped").length;
      }
      if (convoR.status === "fulfilled") {
        const items = convoR.value?.items || [];
        next.conversations = items.length;
        setRecent(items.slice(0, 4));
      }
      if (campR.status === "fulfilled") {
        setCampaigns((campR.value?.items || []).slice(0, 4));
      }

      if (results.every((r) => r.status === "rejected")) {
        setError("Could not load dashboard data.");
      }

      setMetrics(next);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chart = useMemo(() => {
    const rows = [
      { label: "Active", value: metrics.active, cls: "" },
      { label: "Completed", value: metrics.completed, cls: "alt" },
      { label: "Stopped", value: metrics.stopped, cls: "" },
    ];
    const max = Math.max(1, ...rows.map((r) => r.value));
    return rows.map((r) => ({ ...r, pct: Math.round((r.value / max) * 100) }));
  }, [metrics]);

  return (
    <AppLayout>
      <div className="dash-hero">
        <h1>Dashboard</h1>
        <p>
          Welcome back{user?.email ? `, ${user.email}` : ""}. Here's a live
          snapshot of your SMS automation.
        </p>
      </div>

      {error ? <p className="status-error">{error}</p> : null}

      <div className="stats">
        <div className="stat">
          <div className="stat-ico is-primary"><Icon name="contacts" /></div>
          <div className="stat-body">
            <div className="stat-label">Total Contacts</div>
            <div className="stat-value">{metrics.contacts.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-ico is-info"><Icon name="flow" /></div>
          <div className="stat-body">
            <div className="stat-label">Total Enrollments</div>
            <div className="stat-value">{metrics.enrollTotal.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-ico is-success"><Icon name="check" /></div>
          <div className="stat-body">
            <div className="stat-label">Active Enrollments</div>
            <div className="stat-value">{metrics.active.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-ico is-warn"><Icon name="chat" /></div>
          <div className="stat-body">
            <div className="stat-label">Conversations</div>
            <div className="stat-value">{metrics.conversations.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Enrollment status</div>
              <div className="card-sub">Breakdown of current automation states</div>
            </div>
          </div>
          <div className="bar-chart">
            {chart.map((c) => (
              <div className="bar-col" key={c.label}>
                <div className="bar-track">
                  <div
                    className={`bar ${c.cls}`}
                    style={{ height: `${Math.max(c.pct, 4)}%` }}
                    title={`${c.value}`}
                  />
                </div>
                <span className="bar-label">
                  {c.label} · {c.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Campaigns</div>
            <Link className="secondary-button" to="/campaigns" style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}>
              View all
            </Link>
          </div>
          {campaigns.length ? (
            campaigns.map((c) => (
              <div className="list-row" key={c._id}>
                <div className="list-left">
                  <div>
                    <div className="t-primary">{c.name}</div>
                    <div className="t-sub">{c.steps?.length || 0} steps</div>
                  </div>
                </div>
                <span className={c.isActive ? "badge-green" : "badge-orange"}>
                  {c.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            ))
          ) : (
            <p className="muted">No campaigns yet.</p>
          )}
        </div>
      </div>

      <div className="dash-grid" style={{ marginTop: "var(--s6)" }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Recent conversations</div>
            <Link className="secondary-button" to="/inbox" style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}>
              Open Inbox
            </Link>
          </div>
          {recent.length ? (
            recent.map((c) => (
              <div className="list-row" key={c._id}>
                <div className="list-left">
                  <span className="row-avatar">
                    {initials(c.contact?.fullName)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="t-primary">
                      {c.contact?.fullName || "Unknown"}
                    </div>
                    <div className="t-sub">{c.lastMessage || "No messages yet"}</div>
                  </div>
                </div>
                <span className="conv-time">
                  {c.lastMessageAt
                    ? new Date(c.lastMessageAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="muted">No conversations yet.</p>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Quick actions</div>
          </div>
          <div className="stack">
            <Link className="list-row" to="/upload">
              <span className="list-left"><span className="t-primary">Import Contacts</span></span>
              <span className="muted">→</span>
            </Link>
            <Link className="list-row" to="/campaigns">
              <span className="list-left"><span className="t-primary">Create a Campaign</span></span>
              <span className="muted">→</span>
            </Link>
            <Link className="list-row" to="/settings">
              <span className="list-left"><span className="t-primary">Automation Settings</span></span>
              <span className="muted">→</span>
            </Link>
            <Link className="list-row" to="/logs">
              <span className="list-left"><span className="t-primary">System Logs</span></span>
              <span className="muted">→</span>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
