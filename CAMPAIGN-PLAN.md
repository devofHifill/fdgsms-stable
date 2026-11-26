# Campaign delivery plan — daily delivered target, message gap, schedules

Status: **design only — no code yet.** Open questions are in
[CAMPAIGN-QUESTIONS.md](CAMPAIGN-QUESTIONS.md); this plan changes once they are answered.

Builds on fix #18 (every text now gets its final status from Twilio: delivered /
undelivered / failed + error code).

---

## 1. What you want (agreed so far)

| # | Rule | Your decision |
|---|------|---------------|
| A | Campaigns have 2+ steps | ✅ exists today |
| B | Daily target: send until **N delivered** per day (e.g. 300), undelivered don't count | Counts **only step 1 to new contacts** |
| C | Step 1 undelivered → no more texts to that number **in this campaign** | ✅ |
| D | Step 2 (or later) undelivered → no further steps to that number | ✅ |
| E | A number undelivered in one campaign is **skipped in all future campaigns** | ✅ |
| F | **10 undelivered in a row** → something is wrong → campaign stops itself | ✅ |
| G | Replace "Max Messages Per Run" with a **gap between two campaign texts** (seconds / minutes / hours). Only campaign steps — not manual texts, not AI replies | ✅ |
| H | Each step has its own **start setting** (when that step begins sending) | ✅ — exact meaning in Q1 |
| I | Campaign runs for **N days / N weeks / until contacts run out** | ✅ |
| J | When the end is reached: **stop new contacts, let people already in the sequence finish** | ✅ |
| K | Choose **which days of the week** the campaign sends | ✅ |
| L | Import keeps skipping numbers already in the database | ✅ unchanged |
| M | Toggle: when a campaign is **stopped**, remove its pending numbers so a future import doesn't call them "already in database" | ✅ — details in Q9–Q11 |
| N | Delivered counts per campaign | ✅ |
| — | Where the daily target lives (per campaign vs global) | ❓ you're not sure yet — Q4 |

---

## 2. How a campaign day runs (proposed)

Every few seconds the campaign worker does, **per running campaign**:

1. **Is today a sending day?** (chosen weekdays, inside the account sending window
   9am–9pm Eastern, between campaign start and end).
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
**Proposed:** a step-1 text with no final status after **15 minutes counts as delivered**
for the target (so a silent carrier can't block the day). Q6.

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
| 10 undelivered **in a row** in one campaign | Campaign **auto-paused**, warning log + red banner on the campaign: "Paused: 10 undelivered in a row (last error 30007 …)". You fix and press Resume. Counter resets on any delivered text |
| Temporary codes (30003 phone off, 30007 spam filter, 30008) | ❓ same as permanent, or retry? — Q7 |

**Do-not-text list** = new small table `suppressed_numbers` keyed by phone number
(`+1…`), with reason, error code, campaign and date. Kept even if the contact is
later deleted, so a re-import of that number is still blocked from campaigns.

Checked at: enrolling a contact, every campaign send. Manual texts and AI replies →
Q8.

---

## 4. Schedule settings per campaign

| Setting | Example | Notes |
|---------|---------|-------|
| Gap between texts | `45 seconds` / `2 minutes` / `1 hour` | Replaces global "Max Messages Per Run" (Q3: per campaign or shared) |
| Daily delivered target (step 1) | `300` | Q4: per campaign and/or global cap |
| Sending days | Mon–Fri | Uses account timezone (Eastern) |
| Start | `Dec 1, 2026` (or "now") | |
| End | `14 days` / `3 weeks` / `on Dec 31` / `until contacts run out` | After the end: no new step-1 texts; in-progress contacts finish their steps |
| Per step: when it starts | Q1 | |
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

---

## 6. Stop + remove pending numbers (toggle)

Today the import skips a number if a **non-deleted** contact has it. So "remove pending
numbers" = **delete those contacts** (soft delete, as the Contacts page does) when the
campaign is stopped, so the next import treats them as new.

Proposed scope (Q9–Q11 to confirm):
- Only contacts of **this campaign** that **never received step 1**.
- Not contacts that are also in another active campaign, or that have any message history
  (replies, manual texts).
- Their enrollments in this campaign are removed.
- Numbers on the do-not-text list stay blocked even after deletion.

---

## 7. Data changes (rough)

- `Campaign`: `gap { value, unit }`, `dailyDeliveredTarget`, `sendDays [1..7]`, `startAt`,
  `end { type: days|weeks|date|untilExhausted, value }`, `state`,
  `removePendingOnStop`, `consecutiveUndelivered`, `pausedReason`, `lastSentAt`.
- `Campaign.steps[]`: start rule (Q1) instead of / next to `delayHours`.
- `Enrollment`: `excludedReason` (`undelivered_step_1`, `undelivered_step_2`,
  `suppressed`), `step1DeliveredAt`.
- New `SuppressedNumber` collection.
- `AutomationSettings.maxMessagesPerRun` → removed from the Settings page (kept in the DB
  for old data, unused).
- Indexes for daily counts: `SMSMessage { campaignId, stepNumber, createdAt, status }`.

---

## 8. Build order (each its own branch → staging → live)

1. **Undelivered rules + do-not-text list + 10-in-a-row auto-pause + delivered counts.**
   Useful on its own, smallest risk.
2. **Message gap** replaces Max Messages Per Run (worker ticks every few seconds).
3. **Daily delivered target** for step 1.
4. **Schedule:** sending days, start/end, per-step start rule, Finishing/Completed states.
5. **Stop + remove pending numbers** toggle.
6. **Campaign report page.**

---

## 9. Risks / things to know

- **Carrier daily limits (US 10DLC):** carriers cap texts per day per brand. A target above
  it just produces 30007. Keep the target under your 10DLC limit (Q12).
- **Undelivered still costs money** — step 1 is effectively a paid check of each number.
  The existing mobile-only line-type lookup filters many bad numbers before that.
- **Bursts trigger spam filtering** — the gap setting is the main protection.
- **Two campaigns at once** share one Twilio number and its carrier limits (Q3/Q4).
- **Live had VoIP numbers allowed** for testing — 30006 rates will be higher while it is on.
