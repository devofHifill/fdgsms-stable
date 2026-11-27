import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

// Value = normalized line type stored on the server; label = what the user sees.
const LINE_TYPE_OPTIONS = [
  { value: "mobile", label: "Mobile" },
  { value: "landline", label: "Landline" },
  { value: "fixed_voip", label: "Fixed VoIP" },
  { value: "non_fixed_voip", label: "Non-Fixed VoIP" },
  { value: "toll_free", label: "Toll-Free" },
  { value: "unknown", label: "Unknown" },
];

// Timezone the campaign sending window hours are read in.
const DEFAULT_TIMEZONE = "America/New_York";
const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix, no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "UTC", label: "UTC" },
];

function timeNowIn(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
    }).format(new Date());
  } catch {
    return "";
  }
}

export default function SettingsPage() {
  const [form, setForm] = useState({
    enabled: true,
    sendingWindow: {
      startHour: 9,
      endHour: 18,
    },
    timezone: DEFAULT_TIMEZONE,
    allowedLineTypes: ["mobile"],
    minCampaignGap: { value: 5, unit: "seconds" },
    autoPause: { enabled: true, afterUndeliveredInARow: 10 },
    doNotTextList: { manual: "warn", ai: "warn" },
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
        timezone: data.timezone || DEFAULT_TIMEZONE,
        minCampaignGap: {
          value: Number(data.minCampaignGap?.value ?? 5),
          unit: data.minCampaignGap?.unit || "seconds",
        },
        allowedLineTypes: Array.isArray(data.allowedLineTypes)
          ? data.allowedLineTypes
          : ["mobile"],
        autoPause: {
          enabled: data.autoPause?.enabled !== false,
          afterUndeliveredInARow: Number(data.autoPause?.afterUndeliveredInARow ?? 10),
        },
        doNotTextList: {
          manual: data.doNotTextList?.manual === "block" ? "block" : "warn",
          ai: data.doNotTextList?.ai === "block" ? "block" : "warn",
        },
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
        timezone: form.timezone,
        minCampaignGap: {
          value: Number(form.minCampaignGap.value),
          unit: form.minCampaignGap.unit,
        },
        allowedLineTypes: form.allowedLineTypes,
        autoPause: {
          enabled: form.autoPause.enabled,
          afterUndeliveredInARow: Number(form.autoPause.afterUndeliveredInARow),
        },
        doNotTextList: form.doNotTextList,
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

  function toggleLineType(value) {
    setForm((prev) => {
      const set = new Set(prev.allowedLineTypes);
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      return { ...prev, allowedLineTypes: Array.from(set) };
    });
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

              <label className="field-block">
                <span>Timezone</span>
                <select
                  value={form.timezone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, timezone: e.target.value }))
                  }
                >
                  {/* Keep a saved zone that isn't in the short list selectable. */}
                  {TIMEZONE_OPTIONS.some((o) => o.value === form.timezone) ? null : (
                    <option value={form.timezone}>{form.timezone}</option>
                  )}
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small>
                  Campaign texts only go out between the start and end hour in this
                  timezone{timeNowIn(form.timezone) ? ` (now ${timeNowIn(form.timezone)})` : ""}.
                  AI replies are not limited by these hours.
                </small>
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

                <div className="field-block">
                  <span>Minimum gap between campaign texts</span>
                  <div className="gap-row">
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={form.minCampaignGap.value}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          minCampaignGap: { ...prev.minCampaignGap, value: e.target.value },
                        }))
                      }
                      aria-label="Minimum gap between campaign texts"
                    />
                    <select
                      value={form.minCampaignGap.unit}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          minCampaignGap: { ...prev.minCampaignGap, unit: e.target.value },
                        }))
                      }
                      aria-label="Minimum gap unit"
                    >
                      <option value="seconds">seconds</option>
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                    </select>
                  </div>
                  <small className="muted">
                    Each campaign sets its own gap; none can be shorter than this. Never
                    below 5 seconds.
                  </small>
                </div>
              </div>

              <div className="field-block">
                <span>Allowed Line Types for SMS</span>
                <p className="muted">
                  Only numbers whose Twilio line-type lookup matches a checked
                  type are allowed for sending. Unchecking all blocks every
                  number.
                </p>
                <div className="line-type-grid">
                  {LINE_TYPE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={form.allowedLineTypes.includes(opt.value)}
                        onChange={() => toggleLineType(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field-block">
                <span>Undelivered campaign texts</span>
                <p className="muted">
                  Any campaign text that comes back undelivered or failed stops that
                  contact&apos;s remaining steps and puts the number on the
                  do-not-text list, so no campaign texts it again.
                </p>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.autoPause.enabled}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        autoPause: { ...prev.autoPause, enabled: e.target.checked },
                      }))
                    }
                  />
                  <span>Pause a campaign automatically after</span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    className="inline-number"
                    value={form.autoPause.afterUndeliveredInARow}
                    disabled={!form.autoPause.enabled}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        autoPause: { ...prev.autoPause, afterUndeliveredInARow: e.target.value },
                      }))
                    }
                    aria-label="Undelivered texts in a row before pausing"
                  />
                  <span>undelivered texts in a row</span>
                </label>
                <small className="muted">
                  Every error code counts; a delivered text resets the count. A paused
                  campaign restarts only when you press Resume on it.
                </small>
              </div>

              <div className="settings-grid">
                <label className="field-block">
                  <span>Do-not-text list: manual texts</span>
                  <select
                    value={form.doNotTextList.manual}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        doNotTextList: { ...prev.doNotTextList, manual: e.target.value },
                      }))
                    }
                  >
                    <option value="warn">Allow with a warning</option>
                    <option value="block">Block</option>
                  </select>
                </label>

                <label className="field-block">
                  <span>Do-not-text list: AI replies</span>
                  <select
                    value={form.doNotTextList.ai}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        doNotTextList: { ...prev.doNotTextList, ai: e.target.value },
                      }))
                    }
                  >
                    <option value="warn">Allow with a warning</option>
                    <option value="block">Block</option>
                  </select>
                </label>
              </div>
              <small className="muted">
                Campaigns always skip numbers on the do-not-text list. Remove a number
                by hand from its contact page.
              </small>

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
