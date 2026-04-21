import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

const LEVEL_OPTIONS = [
  { label: "All Levels", value: "all" },
  { label: "Info", value: "info" },
  { label: "Warn", value: "warn" },
  { label: "Error", value: "error" },
];

const CATEGORY_OPTIONS = [
  { label: "All Categories", value: "all" },
  { label: "SMS", value: "sms" },
  { label: "Upload", value: "upload" },
  { label: "Webhook", value: "webhook" },
  { label: "Automation", value: "automation" },
  { label: "Auth", value: "auth" },
  { label: "API", value: "api" },
  { label: "System", value: "system" },
];

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function cleanFilterValue(value) {
  return value && value !== "all" ? value : "";
}

function getContactDisplay(contact) {
  if (!contact) return "-";

  if (typeof contact === "string") return contact;

  const name = contact.fullName || "";
  const phone = contact.normalizedPhone || "";

  if (name && phone) return `${name} (${phone})`;
  if (name) return name;
  if (phone) return phone;

  return contact._id || "-";
}

function getCampaignDisplay(campaign) {
  if (!campaign) return "-";

  if (typeof campaign === "string") return campaign;

  return campaign.name || campaign._id || "-";
}

function getEnrollmentDisplay(enrollment) {
  if (!enrollment) return "-";

  if (typeof enrollment === "string") return enrollment;

  const status = enrollment.status || "-";
  const step =
    enrollment.currentStep !== undefined && enrollment.currentStep !== null
      ? enrollment.currentStep
      : "-";

  return `${status} / Step ${step}`;
}

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false,
    total: 0,
  });

  const [filters, setFilters] = useState({
    level: "all",
    category: "all",
    search: "",
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copySuccess, setCopySuccess] = useState("");

  async function loadLogs(page = 1, nextFilters = filters, silent = false) {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });

      const level = cleanFilterValue(nextFilters.level);
      const category = cleanFilterValue(nextFilters.category);
      const search = nextFilters.search.trim();

      if (level) params.set("level", level);
      if (category) params.set("category", category);
      if (search) params.set("search", search);

      const data = await apiFetch(`/logs?${params.toString()}`);
      const items = data.items || [];
      const nextPagination = data.pagination || {
        page,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false,
        total: items.length,
      };

      setLogs(items);
      setPagination(nextPagination);

      setSelectedLog((prev) => {
        if (!items.length) return null;
        if (!prev) return items[0];
        return items.find((item) => item._id === prev._id) || items[0];
      });
    } catch (err) {
      setError(err.message || "Failed to load logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadLogs(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadLogs(pagination.page || 1, filters, true);
    }, 10000);

    return () => clearInterval(timer);
  }, [pagination.page, filters]);

  function handleApplyFilters(e) {
    e.preventDefault();
    loadLogs(1, filters);
  }

  function handleResetFilters() {
    const reset = {
      level: "all",
      category: "all",
      search: "",
    };
    setFilters(reset);
    loadLogs(1, reset);
  }

  async function handleCopyMetadata() {
    if (!selectedLog) return;

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(selectedLog.metadata || {}, null, 2)
      );
      setCopySuccess("Metadata copied");
      setTimeout(() => setCopySuccess(""), 2000);
    } catch {
      setCopySuccess("Copy failed");
      setTimeout(() => setCopySuccess(""), 2000);
    }
  }

  const stats = useMemo(() => {
    const total = pagination.total || logs.length;
    const info = logs.filter((item) => item.level === "info").length;
    const warn = logs.filter((item) => item.level === "warn").length;
    const errorCount = logs.filter((item) => item.level === "error").length;

    return { total, info, warn, error: errorCount };
  }, [logs, pagination.total]);

  return (
    <AppLayout>
      <div className="logs-page">
        <div className="logs-header">
          <div>
            <h1>System Logs</h1>
            <p>Monitor system activity, failures, and automation events.</p>
          </div>

          <div className="logs-header-actions">
            {refreshing ? (
              <span className="logs-refreshing">Auto-refreshing…</span>
            ) : null}
            <button
              onClick={() => loadLogs(1, filters)}
              disabled={loading || refreshing}
              type="button"
            >
              {loading || refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="logs-stats">
          <div className="stat-card">
            <span>Total</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-card">
            <span>Info</span>
            <strong>{stats.info}</strong>
          </div>
          <div className="stat-card">
            <span>Warn</span>
            <strong>{stats.warn}</strong>
          </div>
          <div className="stat-card">
            <span>Error</span>
            <strong>{stats.error}</strong>
          </div>
        </div>

        <form className="logs-toolbar" onSubmit={handleApplyFilters}>
          <label className="field-block">
            <span>Level</span>
            <select
              value={filters.level}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, level: e.target.value }))
              }
            >
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block">
            <span>Category</span>
            <select
              value={filters.category}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, category: e.target.value }))
              }
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block logs-search-field">
            <span>Search</span>
            <input
              type="text"
              placeholder="Search event or message"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
            />
          </label>

          <div className="logs-toolbar-actions">
            <button type="submit" disabled={loading}>
              Apply
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleResetFilters}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </form>

        {error ? <p className="status-error">{error}</p> : null}

        <div className="logs-layout">
          <div className="logs-list-card">
            {loading ? (
              <p>Loading logs...</p>
            ) : logs.length ? (
              <>
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Level</th>
                      <th>Category</th>
                      <th>Event</th>
                      <th>Message</th>
                    </tr>
                  </thead>

                  <tbody>
                    {logs.map((log) => (
                      <tr
                        key={log._id}
                        onClick={() => setSelectedLog(log)}
                        className={
                          selectedLog?._id === log._id
                            ? "log-row log-row-active"
                            : "log-row"
                        }
                      >
                        <td>{formatDate(log.createdAt)}</td>

                        <td>
                          <span className={`status-badge status-${log.level}`}>
                            {log.level || "-"}
                          </span>
                        </td>

                        <td>{log.category || "-"}</td>
                        <td>{log.event || "-"}</td>
                        <td>{log.message || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pagination-bar">
                  <button
                    onClick={() => loadLogs((pagination.page || 1) - 1, filters)}
                    disabled={!pagination.hasPrevPage || loading}
                    type="button"
                  >
                    Previous
                  </button>

                  <span>
                    Page {pagination.page || 1} of {pagination.totalPages || 1} | Total{" "}
                    {pagination.total || 0}
                  </span>

                  <button
                    onClick={() => loadLogs((pagination.page || 1) + 1, filters)}
                    disabled={!pagination.hasNextPage || loading}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <p>No logs found.</p>
            )}
          </div>

          <aside className="log-detail-card">
            {selectedLog ? (
              <>
                <div className="log-detail-header">
                  <div>
                    <h2>Log Details</h2>
                    <p>{selectedLog.event || "-"}</p>
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleCopyMetadata}
                  >
                    Copy Metadata
                  </button>
                </div>

                {copySuccess ? (
                  <p className="status-success">{copySuccess}</p>
                ) : null}

                <div className="detail-grid">
                  <div>
                    <strong>Time</strong>
                    <p>{formatDate(selectedLog.createdAt)}</p>
                  </div>

                  <div>
                    <strong>Level</strong>
                    <p>{selectedLog.level || "-"}</p>
                  </div>

                  <div>
                    <strong>Category</strong>
                    <p>{selectedLog.category || "-"}</p>
                  </div>

                  <div>
                    <strong>Event</strong>
                    <p>{selectedLog.event || "-"}</p>
                  </div>

                  <div>
                    <strong>Message</strong>
                    <p>{selectedLog.message || "-"}</p>
                  </div>

                  <div>
                    <strong>Contact</strong>
                    <p>{getContactDisplay(selectedLog.contactId)}</p>
                  </div>

                  <div>
                    <strong>Enrollment</strong>
                    <p>{getEnrollmentDisplay(selectedLog.enrollmentId)}</p>
                  </div>

                  <div>
                    <strong>Campaign</strong>
                    <p>{getCampaignDisplay(selectedLog.campaignId)}</p>
                  </div>
                </div>

                <div className="log-metadata-card">
                  <h3>Metadata</h3>
                  <pre>{JSON.stringify(selectedLog.metadata || {}, null, 2)}</pre>
                </div>
              </>
            ) : (
              <>
                <h2>Log Details</h2>
                <p>Select a log entry.</p>
              </>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}