import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";

export default function SettingsPage() {
  const [form, setForm] = useState({
    enabled: true,
    sendingWindow: {
      startHour: 9,
      endHour: 18,
    },
    maxMessagesPerRun: 20,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadSettings() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch("/settings");

      setForm({
        enabled: Boolean(data.enabled),
        sendingWindow: {
          startHour: Number(data.sendingWindow?.startHour ?? 9),
          endHour: Number(data.sendingWindow?.endHour ?? 18),
        },
        maxMessagesPerRun: Number(data.maxMessagesPerRun ?? 20),
      });
    } catch (err) {
      setError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        enabled: form.enabled,
        sendingWindow: {
          startHour: Number(form.sendingWindow.startHour),
          endHour: Number(form.sendingWindow.endHour),
        },
        maxMessagesPerRun: Number(form.maxMessagesPerRun),
      };

      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setSuccess("Automation settings updated");
      await loadSettings();
    } catch (err) {
      setError(err.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="campaigns-page">
      <div className="page-header-row">
        <div>
          <h1>Automation Settings</h1>
          <p>Control global automation behavior and sending limits.</p>
        </div>
      </div>

      {error ? <p className="status-error">{error}</p> : null}
      {success ? <p className="status-success">{success}</p> : null}

      <section className="card settings-card">
        {loading ? (
          <p>Loading settings...</p>
        ) : (
          <form className="campaign-form" onSubmit={handleSubmit}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              <span>Automation enabled</span>
            </label>

            <div className="settings-grid">
              <label className="field-block">
                <span>Start Hour</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={form.sendingWindow.startHour}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      sendingWindow: {
                        ...prev.sendingWindow,
                        startHour: e.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>End Hour</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={form.sendingWindow.endHour}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      sendingWindow: {
                        ...prev.sendingWindow,
                        endHour: e.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>Max Messages Per Run</span>
                <input
                  type="number"
                  min="1"
                  value={form.maxMessagesPerRun}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      maxMessagesPerRun: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}