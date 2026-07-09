import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

function createEmptyStep(stepNumber = 1) {
  return {
    stepNumber,
    body: "",
    delayHours: 24,
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    isActive: true,
    steps: [createEmptyStep(1)],
  });

  // Enroll-contacts modal state
  const [enrollFor, setEnrollFor] = useState(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState([]);
  const [pickerSelected, setPickerSelected] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [pickerMsg, setPickerMsg] = useState("");

  async function loadCampaigns() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch("/campaigns");
      setCampaigns(data.items || []);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const data = await apiFetch("/campaigns/stats");
      setStats(data.stats || {});
    } catch {
      /* stats are best-effort */
    }
  }

  useEffect(() => {
    loadCampaigns();
    loadStats();
  }, []);

  function updateStep(index, field, value) {
    setForm((prev) => {
      const nextSteps = [...prev.steps];
      nextSteps[index] = {
        ...nextSteps[index],
        [field]: field === "delayHours" || field === "stepNumber" ? Number(value) : value,
      };
      return {
        ...prev,
        steps: nextSteps,
      };
    });
  }

  function addStep() {
    setForm((prev) => ({
      ...prev,
      steps: [...prev.steps, createEmptyStep(prev.steps.length + 1)],
    }));
  }

  function removeStep(index) {
    setForm((prev) => {
      if (prev.steps.length === 1) return prev;

      const nextSteps = prev.steps
        .filter((_, i) => i !== index)
        .map((step, i) => ({
          ...step,
          stepNumber: i + 1,
        }));

      return {
        ...prev,
        steps: nextSteps,
      };
    });
  }

  function resetForm() {
    setForm({
      name: "",
      isActive: true,
      steps: [createEmptyStep(1)],
    });
    setEditingId(null);
  }

  function startEdit(campaign) {
    setForm({
      name: campaign.name || "",
      isActive: Boolean(campaign.isActive),
      steps: (campaign.steps || []).map((step, i) => ({
        stepNumber: i + 1,
        body: step.body || "",
        delayHours: step.delayHours ?? 0,
      })),
    });
    setEditingId(campaign._id);
    setError("");
    setSuccess("");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        name: form.name.trim(),
        isActive: form.isActive,
        steps: form.steps.map((step, index) => ({
          stepNumber: index + 1,
          body: String(step.body || "").trim(),
          delayHours: Number(step.delayHours) || 0,
        })),
      };

      if (editingId) {
        await apiFetch(`/campaigns/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSuccess("Campaign updated successfully");
      } else {
        await apiFetch("/campaigns", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccess("Campaign created successfully");
      }

      resetForm();
      await Promise.all([loadCampaigns(), loadStats()]);
    } catch (err) {
      setError(err.message || "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(campaign) {
    try {
      setBusyId(campaign._id);
      setError("");
      setSuccess("");

      await apiFetch(`/campaigns/${campaign._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !campaign.isActive }),
      });

      setSuccess(campaign.isActive ? "Campaign paused" : "Campaign resumed");
      await loadCampaigns();
    } catch (err) {
      setError(err.message || "Failed to update campaign");
    } finally {
      setBusyId("");
    }
  }

  async function cloneCampaign(campaign) {
    try {
      setBusyId(campaign._id);
      setError("");
      setSuccess("");

      await apiFetch(`/campaigns/${campaign._id}/clone`, { method: "POST" });

      setSuccess(`Cloned "${campaign.name}"`);
      await Promise.all([loadCampaigns(), loadStats()]);
    } catch (err) {
      setError(err.message || "Failed to clone campaign");
    } finally {
      setBusyId("");
    }
  }

  async function deleteCampaign(campaign) {
    if (
      !window.confirm(
        `Delete campaign "${campaign.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setBusyId(campaign._id);
      setError("");
      setSuccess("");

      await apiFetch(`/campaigns/${campaign._id}`, { method: "DELETE" });

      if (editingId === campaign._id) resetForm();
      setSuccess("Campaign deleted");
      await Promise.all([loadCampaigns(), loadStats()]);
    } catch (err) {
      setError(err.message || "Failed to delete campaign");
    } finally {
      setBusyId("");
    }
  }

  // --- Enroll modal ---
  async function searchContacts(query) {
    try {
      setPickerLoading(true);
      const params = new URLSearchParams({
        page: "1",
        limit: "25",
        search: query || "",
        status: "all",
      });
      const data = await apiFetch(`/contacts?${params.toString()}`);
      setPickerResults(data.items || []);
    } catch (err) {
      setPickerMsg(err.message || "Failed to search contacts");
    } finally {
      setPickerLoading(false);
    }
  }

  function openEnroll(campaign) {
    setEnrollFor(campaign);
    setPickerSearch("");
    setPickerSelected([]);
    setPickerResults([]);
    setPickerMsg("");
    searchContacts("");
  }

  function closeEnroll() {
    setEnrollFor(null);
  }

  function togglePick(id) {
    setPickerSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function doEnroll() {
    if (!enrollFor || !pickerSelected.length) return;

    try {
      setEnrolling(true);
      setPickerMsg("");

      const data = await apiFetch("/enrollments/bulk", {
        method: "POST",
        body: JSON.stringify({
          contactIds: pickerSelected,
          campaignId: enrollFor._id,
        }),
      });

      setPickerMsg(
        `Enrolled ${data.createdCount ?? 0}, skipped ${data.skippedCount ?? 0}.`
      );
      setPickerSelected([]);
      await loadStats();
    } catch (err) {
      setPickerMsg(err.message || "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  }

  const totalSteps = useMemo(() => form.steps.length, [form.steps]);

  return (
    <AppLayout>
      <div className="campaigns-page">
        <div className="page-header-row">
          <div>
            <h1>Campaigns</h1>
            <p>Create and manage automation message sequences.</p>
          </div>
        </div>

        {error ? <p className="status-error">{error}</p> : null}
        {success ? <p className="status-success">{success}</p> : null}

        <div className="campaigns-layout">
          <section className="card">
            <h2>{editingId ? "Edit Campaign" : "Create Campaign"}</h2>

            {editingId ? (
              <div className="editing-banner">
                <span>Editing an existing campaign</span>
                <button type="button" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            ) : null}

            <form className="campaign-form" onSubmit={handleSubmit}>
              <label className="field-block">
                <span>Campaign Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Example: Re-engagement Sequence"
                  required
                />
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                />
                <span>Campaign is active</span>
              </label>

              <div className="steps-header">
                <h3>Steps ({totalSteps})</h3>
                <button type="button" onClick={addStep}>
                  Add Step
                </button>
              </div>

              <div className="steps-list">
                {form.steps.map((step, index) => (
                  <div key={index} className="step-card">
                    <div className="step-card-top">
                      <strong>Step {index + 1}</strong>
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        disabled={form.steps.length === 1}
                      >
                        Remove
                      </button>
                    </div>

                    <label className="field-block">
                      <span>Delay Hours</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={step.delayHours}
                        onChange={(e) =>
                          updateStep(index, "delayHours", e.target.value)
                        }
                      />
                    </label>

                    <label className="field-block">
                      <span>Message Body</span>
                      <textarea
                        rows="4"
                        value={step.body}
                        onChange={(e) => updateStep(index, "body", e.target.value)}
                        placeholder="Type step message..."
                        required
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="form-actions">
                {editingId ? (
                  <button type="button" className="secondary-button" onClick={resetForm}>
                    Cancel
                  </button>
                ) : null}
                <button type="submit" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingId
                    ? "Save Changes"
                    : "Create Campaign"}
                </button>
              </div>
            </form>
          </section>

          <section className="card">
            <h2>Existing Campaigns</h2>

            {loading ? (
              <p>Loading campaigns...</p>
            ) : campaigns.length ? (
              <div className="campaign-list">
                {campaigns.map((campaign) => {
                  const s = stats[campaign._id];
                  return (
                    <div key={campaign._id} className="campaign-list-item">
                      <div className="campaign-list-head">
                        <div>
                          <h3>{campaign.name}</h3>
                          <p>
                            Status{" "}
                            <span
                              className={
                                campaign.isActive ? "badge-green" : "badge-orange"
                              }
                            >
                              {campaign.isActive ? "Active" : "Paused"}
                            </span>
                          </p>
                        </div>

                        <div className="campaign-mini-meta">
                          {campaign.steps?.length || 0} steps
                        </div>
                      </div>

                      <div className="campaign-step-preview">
                        {(campaign.steps || []).map((step) => (
                          <div key={step.stepNumber} className="campaign-step-row">
                            <span className="step-chip">Step {step.stepNumber}</span>
                            <span className="step-delay-chip">
                              {step.delayHours}h
                            </span>
                            <p>{step.body}</p>
                          </div>
                        ))}
                      </div>

                      {s ? (
                        <div className="campaign-stats">
                          <div className="campaign-stat">
                            <span className="n">{s.enrolled}</span>
                            <span className="l">Enrolled</span>
                          </div>
                          <div className="campaign-stat">
                            <span className="n">{s.sent}</span>
                            <span className="l">Sent</span>
                          </div>
                          <div className="campaign-stat">
                            <span className="n">{s.replied}</span>
                            <span className="l">Replied</span>
                          </div>
                          <div className="campaign-stat">
                            <span className="n rate">{s.replyRate}%</span>
                            <span className="l">Reply rate</span>
                          </div>
                        </div>
                      ) : null}

                      <div className="campaign-actions">
                        <button
                          type="button"
                          onClick={() => openEnroll(campaign)}
                          disabled={busyId === campaign._id}
                        >
                          Enroll
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(campaign)}
                          disabled={busyId === campaign._id}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(campaign)}
                          disabled={busyId === campaign._id}
                        >
                          {campaign.isActive ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          onClick={() => cloneCampaign(campaign)}
                          disabled={busyId === campaign._id}
                        >
                          Clone
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => deleteCampaign(campaign)}
                          disabled={busyId === campaign._id}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No campaigns yet.</p>
            )}
          </section>
        </div>
      </div>

      {enrollFor ? (
        <div className="modal-overlay" onClick={closeEnroll}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Enroll contacts</h3>
                <p>Into "{enrollFor.name}"</p>
              </div>
              <button type="button" className="secondary-button" onClick={closeEnroll}>
                Close
              </button>
            </div>

            <div className="modal-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  searchContacts(pickerSearch);
                }}
                style={{ display: "flex", gap: 8, marginBottom: 12 }}
              >
                <input
                  type="text"
                  placeholder="Search name, email, phone..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                />
                <button type="submit">Search</button>
              </form>

              {pickerMsg ? <p className="status-success">{pickerMsg}</p> : null}

              {pickerLoading ? (
                <p className="pick-empty">Loading contacts...</p>
              ) : pickerResults.length ? (
                pickerResults.map((c) => (
                  <label key={c._id} className="pick-row">
                    <input
                      type="checkbox"
                      checked={pickerSelected.includes(c._id)}
                      onChange={() => togglePick(c._id)}
                    />
                    <div>
                      <div className="t-primary">{c.fullName || "-"}</div>
                      <div className="t-sub">
                        {c.phone || c.normalizedPhone || "-"}
                        {c.status ? ` · ${c.status}` : ""}
                      </div>
                    </div>
                  </label>
                ))
              ) : (
                <p className="pick-empty">No contacts found.</p>
              )}
            </div>

            <div className="modal-foot">
              <span className="muted">{pickerSelected.length} selected</span>
              <button
                type="button"
                onClick={doEnroll}
                disabled={enrolling || !pickerSelected.length}
              >
                {enrolling
                  ? "Enrolling..."
                  : `Enroll ${pickerSelected.length || ""} contact${pickerSelected.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
