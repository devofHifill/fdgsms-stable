import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

function createEmptyStep(stepNumber = 1) {
  return {
    stepNumber,
    body: "",
    delayHours: 24,
    start: { type: "afterPrevious", date: "", time: "09:00", minWaitHours: 24 },
  };
}

// Campaign plan C4: schedule (dates are in the account timezone).
const DAYS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" },
  { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];
const EMPTY_SCHEDULE = {
  sendDays: [0, 1, 2, 3, 4, 5, 6],
  startDate: "",
  startTime: "09:00",
  endAfterDays: "",
  endAfterWeeks: "",
  endOnDate: "",
  untilContactsRunOut: false,
};

// Stored Date -> { date: "YYYY-MM-DD", time: "HH:MM" } in the account timezone.
function zonedParts(value, timeZone) {
  if (!value) return { date: "", time: "" };
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(value));
    const g = (k) => parts.find((p) => p.type === k)?.value;
    return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
  } catch {
    return { date: "", time: "" };
  }
}

function formatWhen(value, timeZone, withTime = true) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone, month: "short", day: "numeric", year: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function scheduleToForm(schedule, timeZone) {
  if (!schedule) return { ...EMPTY_SCHEDULE };
  const start = zonedParts(schedule.startAt, timeZone);
  // endOn is stored as the midnight AFTER the chosen day -> show that day.
  const endOn = schedule.endOn ? zonedParts(new Date(new Date(schedule.endOn).getTime() - 1), timeZone) : { date: "" };
  return {
    sendDays: schedule.sendDays?.length ? schedule.sendDays : EMPTY_SCHEDULE.sendDays,
    startDate: start.date,
    startTime: start.time || "09:00",
    endAfterDays: schedule.endAfterDays ?? "",
    endAfterWeeks: schedule.endAfterWeeks ?? "",
    endOnDate: endOn.date,
    untilContactsRunOut: Boolean(schedule.untilContactsRunOut),
  };
}

function daysText(days) {
  const set = new Set(days?.length ? days : EMPTY_SCHEDULE.sendDays);
  if (set.size === 7) return "Every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Mon–Fri";
  return DAYS.filter((d) => set.has(d.v)).map((d) => d.l).join(", ");
}

// One line: "Mon–Fri · starts Dec 1, 9:00 AM · ends after 14 days or when contacts run out"
function scheduleText(campaign, timeZone) {
  const s = campaign.schedule || {};
  const parts = [daysText(s.sendDays)];
  if (s.startAt) parts.push(`starts ${formatWhen(s.startAt, timeZone)}`);
  const ends = [];
  if (s.endAfterDays) ends.push(`after ${s.endAfterDays} day${s.endAfterDays === 1 ? "" : "s"}`);
  if (s.endAfterWeeks) ends.push(`after ${s.endAfterWeeks} week${s.endAfterWeeks === 1 ? "" : "s"}`);
  if (s.endOn) ends.push(`after ${formatWhen(new Date(new Date(s.endOn).getTime() - 1), timeZone, false)}`);
  if (s.untilContactsRunOut) ends.push("when contacts run out");
  parts.push(ends.length ? `ends ${ends.join(" or ")}` : "no end date");
  return parts.join(" · ");
}

function campaignStatus(campaign) {
  if (!campaign.isActive) return { label: "Paused", cls: "badge-orange" };
  if (campaign.state === "completed") return { label: "Completed", cls: "badge-gray" };
  if (campaign.state === "finishing") return { label: "Finishing", cls: "badge-orange" };
  if (campaign.schedule?.startAt && new Date(campaign.schedule.startAt) > new Date()) {
    return { label: "Scheduled", cls: "badge-blue" };
  }
  return { label: "Active", cls: "badge-green" };
}

// Campaign plan C2: gap between two texts of a campaign.
const DEFAULT_GAP = { value: 30, unit: "seconds" };
const GAP_MS = { seconds: 1000, minutes: 60000, hours: 3600000 };

function gapMs(gap) {
  return (Number(gap?.value) || 0) * (GAP_MS[gap?.unit] || 1000);
}

function formatGap(gap) {
  const v = Number(gap?.value) || 0;
  const unit = GAP_MS[gap?.unit] ? gap.unit : "seconds";
  return `${v} ${v === 1 ? unit.slice(0, -1) : unit}`;
}

// "1 text every 30 seconds · up to 1,440 a day in the sending window"
function paceText(gap, pace) {
  const ms = Math.max(gapMs(gap), gapMs(pace.minGap), 5000);
  const perDay = Math.floor((pace.windowHours * 3600000) / ms);
  return `1 text every ${formatGap(gap)} · up to ${perDay.toLocaleString()} a day in the sending window`;
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
    gap: { ...DEFAULT_GAP },
    dailyStep1Target: "",
    schedule: { ...EMPTY_SCHEDULE },
  });
  // Settings needed to explain the gap: minimum gap + sending window length.
  const [pace, setPace] = useState({ minGap: { value: 5, unit: "seconds" }, windowHours: 12 });
  const [accountTz, setAccountTz] = useState("America/New_York");
  // Campaign plan C3: platform daily SMS limit and how much of it is used today.
  const [platform, setPlatform] = useState({ limit: null, today: 0 });

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
    apiFetch("/settings")
      .then((s) => {
        const start = Number(s.sendingWindow?.startHour ?? 9);
        const end = Number(s.sendingWindow?.endHour ?? 18);
        const windowHours = start === end ? 24 : (end - start + 24) % 24;
        setPace({ minGap: s.minCampaignGap || { value: 5, unit: "seconds" }, windowHours });
        if (s.timezone) setAccountTz(s.timezone);
        setPlatform({ limit: s.platformDailySmsLimit ?? null, today: Number(s.todaySmsCount) || 0 });
      })
      .catch(() => {});
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

  function setSchedule(patch) {
    setForm((prev) => ({ ...prev, schedule: { ...prev.schedule, ...patch } }));
  }

  function updateStepStart(index, patch) {
    setForm((prev) => {
      const nextSteps = [...prev.steps];
      const current = nextSteps[index].start || { type: "afterPrevious", date: "", time: "09:00", minWaitHours: 24 };
      nextSteps[index] = { ...nextSteps[index], start: { ...current, ...patch } };
      return { ...prev, steps: nextSteps };
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
      gap: { ...DEFAULT_GAP },
      dailyStep1Target: "",
      schedule: { ...EMPTY_SCHEDULE },
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
        start:
          step.start?.type === "fixedAt"
            ? {
                type: "fixedAt",
                date: zonedParts(step.start.at, accountTz).date,
                time: zonedParts(step.start.at, accountTz).time || "09:00",
                minWaitHours: step.start.minWaitHours ?? 24,
              }
            : { type: "afterPrevious", date: "", time: "09:00", minWaitHours: 24 },
      })),
      schedule: scheduleToForm(campaign.schedule, accountTz),
      gap: {
        value: campaign.gap?.value ?? DEFAULT_GAP.value,
        unit: campaign.gap?.unit || DEFAULT_GAP.unit,
      },
      dailyStep1Target: campaign.dailyStep1Target ?? "",
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
          start:
            index > 0 && step.start?.type === "fixedAt"
              ? { type: "fixedAt", date: step.start.date, time: step.start.time, minWaitHours: step.start.minWaitHours }
              : { type: "afterPrevious" },
        })),
        schedule: form.schedule,
        gap: { value: Number(form.gap.value), unit: form.gap.unit },
        dailyStep1Target:
          String(form.dailyStep1Target).trim() === "" ? null : Number(form.dailyStep1Target),
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

              <div className="field-block">
                <span>Gap between texts</span>
                <div className="gap-row">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={form.gap.value}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, gap: { ...prev.gap, value: e.target.value } }))
                    }
                    aria-label="Gap between texts"
                    required
                  />
                  <select
                    value={form.gap.unit}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, gap: { ...prev.gap, unit: e.target.value } }))
                    }
                    aria-label="Gap unit"
                  >
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                  </select>
                </div>
                <small className="muted">
                  This campaign sends one text, then waits this long before the next
                  ({paceText(form.gap, pace)}). Minimum: {formatGap(pace.minGap)} (Settings).
                  Manual texts and AI replies aren&apos;t affected.
                </small>
              </div>

              <label className="field-block">
                <span>Daily target (new contacts)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="No daily target"
                  value={form.dailyStep1Target}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dailyStep1Target: e.target.value }))
                  }
                />
                <small className="muted">
                  Starts new contacts (step 1) until this many step-1 texts are{" "}
                  <strong>delivered</strong> today; undelivered ones are replaced by more new
                  contacts. Follow-up steps aren&apos;t limited by it. Leave empty for no target.
                  {platform.limit ? ` Platform limit: ${platform.limit.toLocaleString()} texts a day (Settings).` : ""}
                </small>
              </label>

              <div className="field-block schedule-block">
                <span>Schedule</span>
                <div className="day-picks" role="group" aria-label="Sending days">
                  {DAYS.map((d) => (
                    <label key={d.v} className="day-pick">
                      <input
                        type="checkbox"
                        checked={form.schedule.sendDays.includes(d.v)}
                        onChange={() =>
                          setForm((prev) => {
                            const set = new Set(prev.schedule.sendDays);
                            if (set.has(d.v)) set.delete(d.v);
                            else set.add(d.v);
                            return { ...prev, schedule: { ...prev.schedule, sendDays: [...set].sort() } };
                          })
                        }
                      />
                      <span>{d.l}</span>
                    </label>
                  ))}
                </div>

                <div className="schedule-row">
                  <label className="field-block">
                    <span>Start date (empty = now)</span>
                    <input type="date" value={form.schedule.startDate} onChange={(e) => setSchedule({ startDate: e.target.value })} />
                  </label>
                  <label className="field-block">
                    <span>Start time</span>
                    <input type="time" value={form.schedule.startTime} onChange={(e) => setSchedule({ startTime: e.target.value })} />
                  </label>
                </div>

                <div className="schedule-row">
                  <label className="field-block">
                    <span>End after days</span>
                    <input type="number" min="1" step="1" placeholder="—" value={form.schedule.endAfterDays} onChange={(e) => setSchedule({ endAfterDays: e.target.value })} />
                  </label>
                  <label className="field-block">
                    <span>End after weeks</span>
                    <input type="number" min="1" step="1" placeholder="—" value={form.schedule.endAfterWeeks} onChange={(e) => setSchedule({ endAfterWeeks: e.target.value })} />
                  </label>
                  <label className="field-block">
                    <span>End after date</span>
                    <input type="date" value={form.schedule.endOnDate} onChange={(e) => setSchedule({ endOnDate: e.target.value })} />
                  </label>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.schedule.untilContactsRunOut}
                    onChange={(e) => setSchedule({ untilContactsRunOut: e.target.checked })}
                  />
                  <span>End when every contact has had step 1</span>
                </label>
                <small className="muted">
                  Dates and times are in the account timezone ({accountTz}). With several end rules the
                  campaign ends at whichever comes first; after that no new contacts start and the ones
                  already in it finish their steps. A step due on a non-sending day waits for the next one.
                </small>
              </div>

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

                    {index > 0 ? (
                      <label className="field-block">
                        <span>Starts</span>
                        <select
                          value={step.start?.type || "afterPrevious"}
                          onChange={(e) => updateStepStart(index, { type: e.target.value })}
                        >
                          <option value="afterPrevious">After the previous step is delivered</option>
                          <option value="fixedAt">From a fixed date</option>
                        </select>
                      </label>
                    ) : null}

                    {index > 0 && step.start?.type === "fixedAt" ? (
                      <div className="schedule-row">
                        <label className="field-block">
                          <span>Not before</span>
                          <input
                            type="date"
                            value={step.start.date}
                            onChange={(e) => updateStepStart(index, { date: e.target.value })}
                            required
                          />
                        </label>
                        <label className="field-block">
                          <span>Time</span>
                          <input
                            type="time"
                            value={step.start.time}
                            onChange={(e) => updateStepStart(index, { time: e.target.value })}
                          />
                        </label>
                        <label className="field-block">
                          <span>Minimum wait (hours)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={step.start.minWaitHours}
                            onChange={(e) => updateStepStart(index, { minWaitHours: e.target.value })}
                          />
                        </label>
                        <small className="muted schedule-hint">
                          From this date, each contact gets this step once the minimum wait has passed
                          since their own previous step was delivered ({accountTz}).
                        </small>
                      </div>
                    ) : (
                      <label className="field-block">
                        <span>{index === 0 ? "Delay hours (after enrolling)" : "Delay hours (after the previous step is delivered)"}</span>
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
                    )}

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

            {platform.limit && platform.today >= platform.limit ? (
              <div className="campaign-paused-banner" role="alert">
                Platform daily SMS limit reached ({platform.today.toLocaleString()} /{" "}
                {platform.limit.toLocaleString()}). Campaign texts resume tomorrow; manual texts
                and AI replies still go out.
              </div>
            ) : null}

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
                            <span className={campaignStatus(campaign).cls}>
                              {campaignStatus(campaign).label}
                            </span>
                          </p>
                        </div>

                        <div className="campaign-mini-meta">
                          {campaign.steps?.length || 0} steps
                          <div className="campaign-pace" title="Gap between this campaign's texts">
                            {paceText(campaign.gap || DEFAULT_GAP, pace)}
                          </div>
                        </div>
                      </div>

                      <div className="campaign-schedule-line">{scheduleText(campaign, accountTz)}</div>

                      {s?.today ? (
                        <div className="campaign-today">
                          Today:{" "}
                          {s.today.target
                            ? `${s.today.step1Delivered} / ${s.today.target} step-1 delivered`
                            : `${s.today.step1Delivered} step-1 delivered · no daily target`}
                          {s.today.step1Waiting ? ` · ${s.today.step1Waiting} waiting for a report` : ""}
                          {s.today.target && s.today.room === 0 ? " · target reached, new contacts resume tomorrow" : ""}
                        </div>
                      ) : null}

                      {!campaign.isActive && campaign.pausedReason ? (
                        <div className="campaign-paused-banner" role="alert">
                          {campaign.pausedReason}
                        </div>
                      ) : null}

                      <div className="campaign-step-preview">
                        {(campaign.steps || []).map((step) => (
                          <div key={step.stepNumber} className="campaign-step-row">
                            <span className="step-chip">Step {step.stepNumber}</span>
                            <span className="step-delay-chip">
                              {step.start?.type === "fixedAt"
                                ? `from ${formatWhen(step.start.at, accountTz)} (min ${step.start.minWaitHours ?? 24}h)`
                                : `${step.delayHours}h`}
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
                          <div className="campaign-stat">
                            <span className="n">{s.delivered ?? 0}</span>
                            <span className="l">Delivered</span>
                          </div>
                          <div className="campaign-stat">
                            <span className="n">{s.undelivered ?? 0}</span>
                            <span className="l">Undelivered</span>
                          </div>
                          <div className="campaign-stat">
                            <span className="n">{(s.waiting ?? 0) + (s.noReport ?? 0)}</span>
                            <span className="l" title={`${s.noReport ?? 0} with no report after 15 min`}>
                              Waiting / no report
                            </span>
                          </div>
                          <div className="campaign-stat">
                            <span className="n rate">{s.deliveryRate ?? 0}%</span>
                            <span className="l">Delivery rate</span>
                          </div>
                          <div className="campaign-stat">
                            <span className="n">{(s.excludedUndelivered ?? 0) + (s.skippedDoNotText ?? 0)}</span>
                            <span
                              className="l"
                              title={`${s.excludedUndelivered ?? 0} undelivered in this campaign · ${s.skippedDoNotText ?? 0} already on the do-not-text list`}
                            >
                              Excluded
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {s?.steps && Object.keys(s.steps).length > 1 ? (
                        <div className="campaign-step-delivery">
                          {Object.entries(s.steps)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([step, v]) => (
                              <span key={step} className="step-delay-chip">
                                Step {step}: {v.delivered}/{v.sent} delivered
                                {v.undelivered ? ` · ${v.undelivered} undelivered` : ""}
                              </span>
                            ))}
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
