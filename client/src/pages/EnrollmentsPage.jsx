import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500];

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function getStepSummary(enrollment) {
  const currentStep = enrollment?.currentStep ?? "-";
  const totalSteps = enrollment?.campaignId?.steps?.length ?? "-";
  return `${currentStep} / ${totalSteps}`;
}

export default function EnrollmentsPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    stopped: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  async function loadEnrollments(
    nextPage = pagination.page,
    nextLimit = pagination.limit
  ) {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(Math.min(nextLimit || 25, 500)),
      });

      const data = await apiFetch(`/enrollments?${params.toString()}`);
      const items = data.items || [];

      setEnrollments(items);
      setPagination(data.pagination || {});
      setStats(data.stats || {});
      setSelectedEnrollment((prev) => {
        if (!items.length) return null;
        if (!prev) return items[0];
        return items.find((item) => item._id === prev._id) || items[0];
      });
    } catch (err) {
      setError(err.message || "Failed to load enrollments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEnrollments(1, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLimitChange(e) {
    const nextLimit = Math.min(Number(e.target.value) || 25, 500);
    setPagination((prev) => ({ ...prev, page: 1, limit: nextLimit }));
    loadEnrollments(1, nextLimit);
  }

  function handlePrevPage() {
    if (pagination.hasPrevPage) {
      loadEnrollments(pagination.page - 1, pagination.limit);
    }
  }

  function handleNextPage() {
    if (pagination.hasNextPage) {
      loadEnrollments(pagination.page + 1, pagination.limit);
    }
  }

  return (
    <AppLayout>
      <div className="enrollments-page">
        <div className="enrollments-header">
          <div>
            <h1>Enrollments</h1>
            <p>Track automation status, current step, and campaign progress.</p>
          </div>

          <div className="enrollments-header-actions">
            <select
              value={pagination.limit}
              onChange={handleLimitChange}
              disabled={loading}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  Show {size}
                </option>
              ))}
            </select>

            <button
              onClick={() => loadEnrollments(pagination.page, pagination.limit)}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="enrollment-stats">
          <div className="stat">
            <div className="stat-ico is-neutral">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
            </div>
            <div className="stat-body">
              <div className="stat-label">Total</div>
              <div className="stat-value">{stats.total}</div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-ico is-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="stat-body">
              <div className="stat-label">Active</div>
              <div className="stat-value">{stats.active}</div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-ico is-info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div className="stat-body">
              <div className="stat-label">Completed</div>
              <div className="stat-value">{stats.completed}</div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-ico is-warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            </div>
            <div className="stat-body">
              <div className="stat-label">Stopped</div>
              <div className="stat-value">{stats.stopped}</div>
            </div>
          </div>
        </div>

        {error ? <p className="status-error">{error}</p> : null}

        <div className="enrollments-layout">
          <div className="enrollments-list-card">
            {loading ? (
              <p>Loading enrollments...</p>
            ) : enrollments.length ? (
              <>
              <table className="enrollments-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Campaign</th>
                    <th>Step</th>
                    <th>Status</th>
                    <th>Next Send</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((item) => (
                    <tr
                      key={item._id}
                      onClick={() => setSelectedEnrollment(item)}
                      className={
                        selectedEnrollment?._id === item._id
                          ? "enrollment-row enrollment-row-active"
                          : "enrollment-row"
                      }
                    >
                      <td>
                        <div>{item.contactId?.fullName || "-"}</div>
                        <small>
                          {item.contactId?.normalizedPhone ||
                            item.contactId?.phone ||
                            "-"}
                        </small>
                      </td>
                      <td>{item.campaignId?.name || "-"}</td>
                      <td>{getStepSummary(item)}</td>
                      <td>
                        <span className={`status-badge status-${item.status}`}>
                          {item.status || "-"}
                        </span>
                      </td>
                      <td>{formatDate(item.nextSendAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pagination-bar">
                <button
                  onClick={handlePrevPage}
                  disabled={!pagination.hasPrevPage}
                >
                  Previous
                </button>

                <span>
                  Page {pagination.page} of {pagination.totalPages} | Total{" "}
                  {pagination.total}
                </span>

                <button
                  onClick={handleNextPage}
                  disabled={!pagination.hasNextPage}
                >
                  Next
                </button>
              </div>
              </>
            ) : (
              <p>No enrollments found.</p>
            )}
          </div>

          <aside className="enrollment-detail-card">
            {selectedEnrollment ? (
              <>
                <h2>Enrollment Details</h2>

                <div className="detail-grid">
                  <div>
                    <strong>Contact</strong>
                    <p>{selectedEnrollment.contactId?.fullName || "-"}</p>
                  </div>

                  <div>
                    <strong>Phone</strong>
                    <p>
                      {selectedEnrollment.contactId?.normalizedPhone ||
                        selectedEnrollment.contactId?.phone ||
                        "-"}
                    </p>
                  </div>

                  <div>
                    <strong>Campaign</strong>
                    <p>{selectedEnrollment.campaignId?.name || "-"}</p>
                  </div>

                  <div>
                    <strong>Status</strong>
                    <p>{selectedEnrollment.status || "-"}</p>
                  </div>

                  <div>
                    <strong>Current Step</strong>
                    <p>{selectedEnrollment.currentStep ?? "-"}</p>
                  </div>

                  <div>
                    <strong>Total Steps</strong>
                    <p>{selectedEnrollment.campaignId?.steps?.length ?? "-"}</p>
                  </div>

                  <div>
                    <strong>Next Send At</strong>
                    <p>{formatDate(selectedEnrollment.nextSendAt)}</p>
                  </div>

                  <div>
                    <strong>Stop Reason</strong>
                    <p>{selectedEnrollment.stopReason || "-"}</p>
                  </div>

                  <div>
                    <strong>Last Sent At</strong>
                    <p>{formatDate(selectedEnrollment.lastSentAt)}</p>
                  </div>

                  <div>
                    <strong>Reply Detected At</strong>
                    <p>{formatDate(selectedEnrollment.replyDetectedAt)}</p>
                  </div>

                  <div>
                    <strong>Completed At</strong>
                    <p>{formatDate(selectedEnrollment.completedAt)}</p>
                  </div>

                  <div>
                    <strong>Created At</strong>
                    <p>{formatDate(selectedEnrollment.createdAt)}</p>
                  </div>

                  <div>
                    <strong>Updated At</strong>
                    <p>{formatDate(selectedEnrollment.updatedAt)}</p>
                  </div>
                </div>

                <div className="campaign-steps-card">
                  <h3>Campaign Steps</h3>

                  {selectedEnrollment.campaignId?.steps?.length ? (
                    <div className="steps-list">
                      {selectedEnrollment.campaignId.steps.map((step) => {
                        const isCurrent =
                          Number(step.stepNumber) ===
                          Number(selectedEnrollment.currentStep);

                        return (
                          <div
                            key={`${selectedEnrollment._id}-step-${step.stepNumber}`}
                            className={
                              isCurrent ? "step-item step-item-current" : "step-item"
                            }
                          >
                            <div className="step-item-top">
                              <strong>Step {step.stepNumber}</strong>
                              <span>{step.delayHours}h delay</span>
                            </div>
                            <p>{step.body}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p>No campaign steps found.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2>Enrollment Details</h2>
                <p>Select an enrollment to view details.</p>
              </>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}