import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";

function createEmptyStep(stepNumber = 1) {
  return {
    stepNumber,
    body: "",
    delayHours: 24,
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "",
    isActive: true,
    steps: [createEmptyStep(1)],
  });

  async function loadCampaigns() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch("/api/campaigns");
      setCampaigns(data.items || []);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
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

      await apiFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSuccess("Campaign created successfully");
      setForm({
        name: "",
        isActive: true,
        steps: [createEmptyStep(1)],
      });

      await loadCampaigns();
    } catch (err) {
      setError(err.message || "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  }

  const totalSteps = useMemo(() => form.steps.length, [form.steps]);

  return (
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
          <h2>Create Campaign</h2>

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
                      onChange={(e) => updateStep(index, "delayHours", e.target.value)}
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
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Create Campaign"}
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
              {campaigns.map((campaign) => (
                <div key={campaign._id} className="campaign-list-item">
                  <div className="campaign-list-head">
                    <div>
                      <h3>{campaign.name}</h3>
                      <p>
                        Status:{" "}
                        <span className={campaign.isActive ? "badge-green" : "badge-orange"}>
                          {campaign.isActive ? "Active" : "Inactive"}
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
                        <span className="step-delay-chip">{step.delayHours}h</span>
                        <p>{step.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No campaigns yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}