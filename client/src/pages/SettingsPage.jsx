import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

export default function SettingsPage() {
  const [form, setForm] = useState({
    enabled: true,
    sendingWindow: {
      startHour: 9,
      endHour: 18,
    },
    maxMessagesPerRun: 20,
  });

  const [twilio, setTwilio] = useState({
    accountSid: "",
    authToken: "",
    phoneNumber: "",
    messagingServiceSid: "",
  });
  const [twilioMeta, setTwilioMeta] = useState({
    authTokenSet: false,
    authTokenMasked: "",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [twilioSaving, setTwilioSaving] = useState(false);
  const [twilioError, setTwilioError] = useState("");
  const [twilioSuccess, setTwilioSuccess] = useState("");

  async function loadSettings() {
    try {
      setLoading(true);
      setError("");

      const [data, twilioData] = await Promise.all([
        apiFetch("/settings"),
        apiFetch("/twilio-settings"),
      ]);

      setForm({
        enabled: Boolean(data.enabled),
        sendingWindow: {
          startHour: Number(data.sendingWindow?.startHour ?? 9),
          endHour: Number(data.sendingWindow?.endHour ?? 18),
        },
        maxMessagesPerRun: Number(data.maxMessagesPerRun ?? 20),
      });

      setTwilio({
        accountSid: twilioData.accountSid || "",
        authToken: "",
        phoneNumber: twilioData.phoneNumber || "",
        messagingServiceSid: twilioData.messagingServiceSid || "",
      });
      setTwilioMeta({
        authTokenSet: Boolean(twilioData.authTokenSet),
        authTokenMasked: twilioData.authTokenMasked || "",
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

  async function handleTwilioSubmit(e) {
    e.preventDefault();

    try {
      setTwilioSaving(true);
      setTwilioError("");
      setTwilioSuccess("");

      // Only send the auth token when the operator typed a new one; a blank
      // field keeps the credential already stored on the server.
      const payload = {
        accountSid: twilio.accountSid.trim(),
        phoneNumber: twilio.phoneNumber.trim(),
        messagingServiceSid: twilio.messagingServiceSid.trim(),
      };
      if (twilio.authToken.trim()) {
        payload.authToken = twilio.authToken.trim();
      }

      await apiFetch("/twilio-settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setTwilioSuccess("Twilio credentials saved");
      await loadSettings();
    } catch (err) {
      setTwilioError(err.message || "Failed to save Twilio credentials");
    } finally {
      setTwilioSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="campaigns-page">
        <div className="page-header-row">
          <div>
            <h1>Settings</h1>
            <p>Configure your SMS provider and automation behavior.</p>
          </div>
        </div>

        <section className="card settings-card">
          <h2>Twilio Credentials</h2>
          <p className="muted">
            Used to send SMS and look up phone numbers. Values entered here take
            precedence over server environment variables.
          </p>

          {twilioError ? <p className="status-error">{twilioError}</p> : null}
          {twilioSuccess ? (
            <p className="status-success">{twilioSuccess}</p>
          ) : null}

          {loading ? (
            <p>Loading credentials...</p>
          ) : (
            <form className="campaign-form" onSubmit={handleTwilioSubmit}>
              <label className="field-block">
                <span>Account SID</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={twilio.accountSid}
                  onChange={(e) =>
                    setTwilio((prev) => ({
                      ...prev,
                      accountSid: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>Auth Token</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    twilioMeta.authTokenSet
                      ? `Saved (${twilioMeta.authTokenMasked}) — leave blank to keep`
                      : "Enter Twilio auth token"
                  }
                  value={twilio.authToken}
                  onChange={(e) =>
                    setTwilio((prev) => ({
                      ...prev,
                      authToken: e.target.value,
                    }))
                  }
                />
              </label>

              <div className="settings-grid">
                <label className="field-block">
                  <span>Sender Phone Number</span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="+15551234567"
                    value={twilio.phoneNumber}
                    onChange={(e) =>
                      setTwilio((prev) => ({
                        ...prev,
                        phoneNumber: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="field-block">
                  <span>Messaging Service SID (optional)</span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={twilio.messagingServiceSid}
                    onChange={(e) =>
                      setTwilio((prev) => ({
                        ...prev,
                        messagingServiceSid: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <p className="muted">
                If a Messaging Service SID is set it is used for sending;
                otherwise the sender phone number is used.
              </p>

              <div className="form-actions">
                <button type="submit" disabled={twilioSaving}>
                  {twilioSaving ? "Saving..." : "Save Twilio Credentials"}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="card settings-card">
          <h2>Automation Settings</h2>
          <p className="muted">
            Control global automation behavior and sending limits.
          </p>

          {error ? <p className="status-error">{error}</p> : null}
          {success ? <p className="status-success">{success}</p> : null}

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
    </AppLayout>
  );
}
