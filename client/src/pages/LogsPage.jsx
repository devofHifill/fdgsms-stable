import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";

const LEVELS = ["all", "info", "warn", "error"];
const CATEGORIES = ["all", "sms", "upload", "webhook", "automation", "auth", "api", "system"];

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
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
  const [error, setError] = useState("");

  async function loadLogs(page = 1, nextFilters = filters) {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        level: nextFilters.level,
        category: nextFilters.category,
        search: nextFilters.search,
      });

      const data = await apiFetch(`/api/logs?${params.toString()}`);
      setLogs(data.items || []);
      setPagination(data.pagination || {});
    } catch (err) {
      setError(err.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs(1, filters);
  }, []);

  function handleApplyFilters(e) {
    e.preventDefault();
    loadLogs(1, filters);
  }

  return (
    <div className="logs-page">
      <div className="logs-header">
        <div>
          <h1>System Logs</h1>
          <p>View send failures, webhook issues, upload problems, and automation errors.</p>
        </div>
      </div>

      <form className="logs-filters" onSubmit={handleApplyFilters}>
        <select
          value={filters.level}
          onChange={(e) => setFilters((p) => ({ ...p, level: e.target.value }))}
        >
          {LEVELS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          value={filters.category}
          onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
        >
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search event or message"
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
        />

        <button type="submit">Apply</button>
      </form>

      {error ? <p className="status-error">{error}</p> : null}

      <div className="logs-card">
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
                {logs.map((item) => (
                  <tr key={item._id}>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <span className={`status-badge status-${item.level}`}>
                        {item.level}
                      </span>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.event}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination-bar">
              <button
                onClick={() => loadLogs(pagination.page - 1, filters)}
                disabled={!pagination.hasPrevPage}
              >
                Previous
              </button>

              <span>
                Page {pagination.page} of {pagination.totalPages} | Total {pagination.total}
              </span>

              <button
                onClick={() => loadLogs(pagination.page + 1, filters)}
                disabled={!pagination.hasNextPage}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <p>No logs found.</p>
        )}
      </div>
    </div>
  );
}