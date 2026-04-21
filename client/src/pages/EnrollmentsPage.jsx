import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  async function loadEnrollments() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch("/enrollments");
      const items = data.items || [];

      setEnrollments(items);
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
    loadEnrollments();
  }, []);

  const stats = useMemo(() => {
    const total = enrollments.length;
    const active = enrollments.filter((x) => x.status === "active").length;
    const completed = enrollments.filter((x) => x.status === "completed").length;
    const stopped = enrollments.filter((x) => x.status === "stopped").length;

    return { total, active, completed, stopped };
  }, [enrollments]);

  return (
    <AppLayout>
      <div className="enrollments-page">
        <div className="enrollments-header">
          <div>
            <h1>Enrollments</h1>
            <p>Track automation status, current step, and campaign progress.</p>
          </div>

          <button onClick={loadEnrollments} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="enrollment-stats">
          <div className="stat-card">
            <span>Total</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-card">
            <span>Active</span>
            <strong>{stats.active}</strong>
          </div>
          <div className="stat-card">
            <span>Completed</span>
            <strong>{stats.completed}</strong>
          </div>
          <div className="stat-card">
            <span>Stopped</span>
            <strong>{stats.stopped}</strong>
          </div>
        </div>

        {error ? <p className="status-error">{error}</p> : null}

        <div className="enrollments-layout">
          <div className="enrollments-list-card">
            {loading ? (
              <p>Loading enrollments...</p>
            ) : enrollments.length ? (
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