# Campaign delivery plan — daily delivered target, message gap, schedules

Status: **design only — no code yet. All questions answered (2026-11-27)** — see
[CAMPAIGN-QUESTIONS.md](CAMPAIGN-QUESTIONS.md). Ready for review before building.

Builds on fix #18 (every text now gets its final status from Twilio: delivered /
undelivered / failed + error code).

**Status key:** ⬜ To do · 🟨 In progress · 🟦 In review (PR open) · 🧪 On staging, testing · ✅ Done (on main, checked on live) · ⏸ Waiting on a decision

## Tracker

| #  | Stage | What it covers | Status | Branch | PR |
|----|-------|----------------|--------|--------|----|
| C1 | Undelivered rules | Step 1 / later-step undelivered → excluded; do-not-text list (all campaigns, Settings block/warn for manual + AI, import skip, manual removal); auto-pause after N in a row (Settings on/off + N); "no report" after 15 min, 24 h late-report window; delivered counts | 🟨 | `feat/campaign-undelivered-rules` | built 2026-11-27, not pushed yet |
| C2 | Message gap | Per-campaign gap (s / min / h) replaces Max Messages Per Run; Settings minimum gap (≥ 5 s); existing campaigns start at 30 s | ⬜ | `feat/campaign-message-gap` | |
| C3 | Daily targets | Per-campaign step-1 delivered target; platform daily SMS limit in Settings (starts at 2,000; manual + AI count but never blocked); follow-ups first near the limit | ⬜ | `feat/campaign-daily-target` | |
| C4 | Schedule | Sending days; start date; end rules (days / weeks / date / until contacts run out, whichever first); per-step start (after previous or fixed "not before" date + minimum wait); Finishing → Completed; add contacts while running | ⬜ | `feat/campaign-schedule` | |
| C5 | Pause / Stop | Separate Pause and Stop buttons; Stop toggle soft-deletes contacts who never got step 1 (keeps ones in other campaigns or with history) | ⬜ | `feat/campaign-stop-cleanup` | |
| C6 | Campaign report | Per step / per day counts, top error codes, estimated finish, cost per campaign from message prices | ⬜ | `feat/campaign-report` | |
| C7 | Twilio spend | Account spend today / this month on the Dashboard (SMS, lookups, number rental) | ⬜ | `feat/twilio-spend` | |

**Progress:** 0 / 7 done · C1 built and tested locally (2026-11-27)

---

## 1. What you want (agreed so far)

| # | Rule | Your decision |
|---|------|---------------|
| A | Campaigns have 2+ steps | ✅ exists today |
| B | Daily target: send until **N delivered** per day (e.g. 300), undelivered don't count | Counts **only step 1 to new contacts**; each undelivered one is replaced by another new contact |
| B2 | Follow-up steps have **no daily cap** — limited only by the gap, window and days. A 3-step campaign at 300/day reaches ≈ 900 texts/day from day 3 | ✅ (Q5) |
| C | Step 1 undelivered → no more texts to that number **in this campaign** | ✅ |
| D | Step 2 (or later) undelivered → no further steps to that number | ✅ |
| D2 | A follow-up step waits until the previous step is **delivered** (not just sent); its delay / minimum wait counts from that moment | ✅ (Q2) |
| E | A number undelivered in one campaign is **skipped in all future campaigns** | ✅ For manual texts / AI replies: Settings choice per type, Block or Allow with a warning (Q8) |
| F | **10 undelivered in a row** → something is wrong → campaign stops itself | ✅ Any error code counts; the number (default 10) and an on/off switch are on the Settings page (Q7b) |
| G | Replace "Max Messages Per Run" with a **gap between two campaign texts** (seconds / minutes / hours). Only campaign steps — not manual texts, not AI replies | ✅ Gap is **per campaign** (Q3) |
| G2 | **Minimum gap** setting on the Settings page (you choose, never below 5 s); no campaign gap can be shorter | ✅ (Q3b) |
| H | Each step has its own **start setting** (when that step begins sending) | ✅ **Both, chosen per step:** delay after the contact's previous step, or a fixed date/time (Q1). A fixed date is a **"not before" date** plus a minimum wait after that contact's previous step (default 1 day) (Q1b) |
| I | Campaign runs for **N days / N weeks / until contacts run out** | ✅ |
| J | When the end is reached: **stop new contacts, let people already in the sequence finish** | ✅ |
| K | Choose **which days of the week** the campaign sends | ✅ |
| L | Import keeps skipping numbers already in the database | ✅ unchanged |
| M | Toggle: when a campaign is **stopped**, remove its pending numbers so a future import doesn't call them "already in database" | ✅ Pending = never got step 1; contacts in another campaign or with history are kept; soft delete; separate Pause and Stop buttons (Q9–Q11b) |
| N | Delivered counts per campaign | ✅ |
| B3 | Step-1 daily target is set **per campaign** | ✅ (Q4) |
| B4 | **Platform daily SMS limit** in Settings, **starting at 2,000** (your 10DLC limit, Q12), changeable: max texts per day across all campaigns (step 1 + follow-ups). When reached, campaigns stop until the next sending day | ✅ (Q4). Manual texts + AI replies **count** towards it but are **never blocked** (Q4b). Near the limit, **follow-ups go before new step-1 contacts** (Q4c) |

---

## 2. How a campaign day runs (proposed)

Every few seconds the campaign worker does, **per running campaign**:

1. **Is today a sending day?** (chosen weekdays, inside the account sending window
   9am–9pm Eastern, between campaign start and end). **Platform daily SMS limit not yet
   reached?** (Settings; counts every text sent today — campaign, manual and AI — but only
   campaign texts are held back when it's reached.)
2. **Is the gap respected?** Time since this campaign's last text ≥ the campaign gap
   (e.g. 45 s). If not, wait.
3. **Follow-ups first:** pick one contact whose step 2/3/… is due (its step start rule
   reached, previous step delivered). Follow-ups are **not** limited by the daily target —
   only by the gap and window.
4. **Otherwise a new contact (step 1)** — only if the daily target has room:

   ```
   room = target − step-1 delivered today − step-1 texts still waiting for a status
   ```

   If `room > 0`, send step 1 to the next contact in upload order.
5. Repeat on the next tick.

So with a 300 target the system keeps starting new contacts until **300 step-1 texts are
delivered today**. Each undelivered one frees a place → one more new contact is tried.

### "Waiting for a status"
Twilio usually reports within seconds; some carriers never send a delivery receipt.
**Decided (Q6): a text with no report is never counted as delivered.** After a waiting time
(Q6c, default 15 min) it becomes **"no report"**: it stops holding a place in the day's
target (another new contact is tried). Its follow-ups are **held**: a step's clock only starts
when the previous step is delivered (Q2). If a late "delivered" arrives within **24 h**, the
contact carries on from that moment; if not, their remaining steps are cancelled and the
number is **not** put on the do-not-text list (Q6b, Q6c).

### Realistic promise
"300 delivered per day, ±a few", because texts in flight can all turn out delivered.
The worker never has more than a small number in flight (gap + "waiting" rule keep it
small). If the gap is too long to fit 300 sends into the window, the campaign page warns:
*"12 h window ÷ 3 min gap = 240 texts max — target 300 can't be reached."*

---

## 3. Undelivered handling

| Event | Effect |
|-------|--------|
| Step 1 undelivered/failed | Contact **excluded** from this campaign; number added to the **do-not-text list** (all future campaigns) |
| Step 2+ undelivered/failed | No further steps for that contact; number added to the do-not-text list |
| 10 undelivered **in a row** in one campaign | Campaign **auto-paused**, warning log + red banner on the campaign: "Paused: 10 undelivered in a row (last error 30007 …)". **Every error code counts** (30006, 30007, … — Q7b); a delivered text resets the counter. **Settings page:** on/off switch + the number in a row (default 10), for all campaigns. Only **you** restart it with **Resume** (counter back to 0) — never automatic (Q7c) |
| No report after 15 min | Frees its place in the daily target; not counted as delivered. Follow-ups held; late "delivered" within 24 h → carry on; else steps cancelled, number **not** put on the do-not-text list |
| Temporary codes (30003 phone off, 30007 spam filter, 30008) | **Same as permanent (Q7):** excluded + do-not-text list, no retries. Risk: 30007 from bad wording can list good numbers — the 10-in-a-row pause and manual removal (Q8c) limit it |

**Do-not-text list** = new small table `suppressed_numbers` keyed by phone number
(`+1…`), with reason, error code, campaign and date. Kept even if the contact is
later deleted, so a re-import of that number is still blocked from campaigns.

Checked at: enrolling a contact, every campaign send (always blocked). **Manual texts and
AI replies:** a Settings-page choice for each — **Block** or **Allow with a warning**
(starts as "Allow with a warning") (Q8).

**Import:** numbers on the list show in the preview as invalid, "previously undelivered
(30006)", and are not imported (Q8b). **Undo:** a "Remove from do-not-text list" button on the
contact page, logged (Q8c).

---

## 4. Schedule settings per campaign

| Setting | Example | Notes |
|---------|---------|-------|
| Gap between texts | `45 seconds` / `2 minutes` / `1 hour` | Per campaign (Q3). Replaces global "Max Messages Per Run". Can't be below the Settings-page minimum gap (≥ 5 s) |
| Daily delivered target (step 1) | `300` | Per campaign (Q4). Also limited by the platform daily SMS limit in Settings |
| Sending days | Mon–Fri | Uses account timezone (Eastern). A step due on a non-sending day moves to the **next sending day** (Q14) |
| Add contacts later | 2nd upload on day 5 | Allowed while running; they join the queue after those already waiting (Q15) |
| Start | `Dec 1, 2026` (or "now") | |
| End | `14 days` / `3 weeks` / `on Dec 31` / `until contacts run out` | Several rules → **whichever comes first** (Q13). After the end: no new step-1 texts; in-progress contacts finish their steps |
| Per step: when it starts | Step 2: `2 days after step 1` · Step 3: `from Dec 8, 9:00 am` | Chosen per step: **after previous step** (delay in minutes / hours / days, counted from that contact's previous step being delivered) or **fixed date/time**, used as a "not before" date: a contact gets the step on/after that date once their own minimum wait (default 1 day) since the previous step has passed. Step 1 always follows the daily target + campaign start |
| On stop: remove pending numbers | toggle | §6 |

Campaign states: **Draft → Running ⇄ Paused → Finishing (no new contacts) → Completed**,
plus **Stopped** (manual, final).

---

## 5. Reports (per campaign)

- **Contacts:** uploaded · not started · in progress · finished · replied · opted out ·
  excluded (undelivered) · skipped (already on do-not-text list).
- **Per step:** sent · delivered · undelivered · waiting · delivery %.
- **Per day:** step-1 delivered vs target (e.g. Mon 300/300, Tue 300/300, Wed 112/300 —
  contacts ran out).
- **Top error codes** (e.g. 30007 × 41, 30006 × 12).
- Estimated finish: "≈ 4 more sending days at 300/day".
- **Twilio spend (Q16):** account spend today / this month on the Dashboard (Twilio usage
  data: SMS, lookups, number rental) **and** cost per campaign from each message's price,
  e.g. "4,120 texts · $33.40 · $0.0081 per delivered text" (Q16b: both).

---

## 6. Stop + remove pending numbers (toggle)

Today the import skips a number if a **non-deleted** contact has it. So "remove pending
numbers" = **delete those contacts** (soft delete, as the Contacts page does) when the
campaign is stopped, so the next import treats them as new.

Decided (Q9–Q11b):
- Two buttons: **Pause** (resume later, nothing removed) and **Stop** (final). The toggle
  only applies to **Stop**.
- Removed: only contacts of **this campaign** that **never received step 1**.
- Kept: contacts that are also in another campaign, or that have any message history
  (replies, manual texts).
- "Remove" = **soft delete**, same as the Contacts page; their enrollments in this campaign
  are removed too.
- Numbers on the do-not-text list stay blocked even after deletion.

---

## 7. Data changes (rough)

- `Campaign`: `gap { value, unit }`, `dailyDeliveredTarget`, `sendDays [1..7]`, `startAt`,
  `end { type: days|weeks|date|untilExhausted, value }`, `state`,
  `removePendingOnStop`, `consecutiveUndelivered`, `pausedReason`, `lastSentAt`.
- `Campaign.steps[]`: `start { type: "afterPrevious" | "fixedAt", delay { value, unit }, at,
  minWait { value, unit } }` — `minWait` (default 1 day) applies to `fixedAt` steps.
  Existing `delayHours` becomes `afterPrevious` with the same delay, so current campaigns
  keep working.
- `Enrollment`: `excludedReason` (`undelivered_step_1`, `undelivered_step_2`,
  `suppressed`), `step1DeliveredAt`.
- New `SuppressedNumber` collection.
- `AutomationSettings.maxMessagesPerRun` → removed from the Settings page (kept in the DB
  for old data, unused) (Q17). Existing campaigns get a **30-second gap** to start.
- `AutomationSettings.minCampaignGap { value, unit }` (default 5 s, never below 5 s).
- `AutomationSettings.autoPause { enabled (default true), afterUndeliveredInARow (default 10) }`.
- `AutomationSettings.doNotTextList { manual: "block" | "warn", ai: "block" | "warn" }`
  (both start as "warn"; campaigns always blocked).
- `AutomationSettings.platformDailySmsLimit` (number, **starts at 2,000** = your 10DLC daily
  limit (Q12); you can change it; empty = no limit). Counted per day in the
  account timezone.
- Indexes for daily counts: `SMSMessage { campaignId, stepNumber, createdAt, status }`.

---

## 8. Build order (each its own branch → staging → live)

Same stages as the [Tracker](#tracker) at the top (C1–C7); status lives there.

1. **Undelivered rules + do-not-text list + 10-in-a-row auto-pause + delivered counts.**
   Useful on its own, smallest risk.
2. **Message gap** replaces Max Messages Per Run (worker ticks every few seconds).
3. **Daily delivered target** for step 1.
4. **Schedule:** sending days, start/end, per-step start rule, Finishing/Completed states.
5. **Stop + remove pending numbers** toggle.
6. **Campaign report page**, including cost per campaign (message prices from Twilio).

Small and separate, can go any time: **Twilio spend today / this month on the Dashboard**.

---

## 9. Risks / things to know

- **Carrier daily limits (US 10DLC):** your limit is **2,000 texts a day** (Q12). The platform
  daily SMS limit starts at 2,000 so the platform can't go over it; change it in Settings if
  your 10DLC tier changes.
- **Undelivered still costs money** — step 1 is effectively a paid check of each number.
  The existing mobile-only line-type lookup filters many bad numbers before that.
- **Bursts trigger spam filtering** — the gap setting is the main protection.
- **Two campaigns at once** share one Twilio number and its carrier limits (Q3/Q4).
- **Live had VoIP numbers allowed** for testing — 30006 rates will be higher while it is on.
