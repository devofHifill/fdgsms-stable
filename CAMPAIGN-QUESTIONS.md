# Campaign plan — open questions

Answer under each **Answer:** line (a word or two is fine). Where I suggest a default,
writing "default" is enough. Plan: [CAMPAIGN-PLAN.md](CAMPAIGN-PLAN.md).

---

## Step timing

**Q1. "When a step should start sending" — which do you mean?**
- (a) **Delay after the previous step**, per contact (today's `delayHours`), e.g. step 2 goes
  2 days after *that contact's* step 1 was delivered.
- (b) **A fixed date/time per step for everyone**, e.g. step 1 from Dec 1, step 2 from Dec 4
  9am, step 3 from Dec 8.
- (c) Both: choose per step.

Answer: **(c) Both — choose per step.** (2026-11-27)

**Q1b. A step set to a fixed date — what about contacts who only got the previous step
recently?** Contacts start step 1 on different days (300 a day), so on the fixed date of
step 2 some got step 1 two weeks ago and some got it yesterday.
- (a) Fixed date is a **"not before"** date: on/after it, each contact gets step 2 once a
  minimum wait after *their own* previous step has also passed (e.g. at least 1 day).
- (b) Fixed date is **exact**: everyone whose previous step was delivered gets step 2 that
  day, however recent.
- (c) Fixed date applies only to contacts whose previous step was delivered **before** that
  date; later ones wait until the next step's date (or skip the step).

Default: (a) with a 1-day minimum wait.

Answer: **(a) "Not before" date + minimum wait after the contact's own previous step**
(default 1 day, can be changed per step). (2026-11-27)

Example: 900 contacts, 300/day → step 1 on Mon/Tue/Wed. Step 2 fixed at Wed 9am, minimum
wait 1 day → contacts from Mon and Tue get step 2 on Wed; contacts from Wed get it on Thu.

**Q2. A follow-up step — should it wait for the previous step to be *delivered*, or just *sent*?**
Default: wait for delivered (so we never send step 2 to a number whose step 1 failed).

Answer: **Default — wait for delivered.** A step's delay / minimum wait is counted from the
moment the previous step was delivered. (2026-11-27)

---

## Gap between texts

**Q3. Is the gap per campaign, or one gap shared by all campaigns?**
If two campaigns run at once with a 60 s gap each, per-campaign = up to 2 texts/minute from
your number; shared = 1 text/minute total. Default: **per campaign**, plus the shared
sending window.

Answer: **Default — gap per campaign.** (2026-11-27)

**Q3b. Smallest gap allowed?** Default: 5 seconds (below that carriers see a burst).

Answer: **A "Minimum gap between campaign texts" setting on the Settings page**, chosen
by you (seconds / minutes / hours), never lower than **5 seconds**. No campaign can be set to a
gap shorter than this minimum. (2026-11-27)

---

## Daily target

**Q4. Where should the daily target (e.g. 300) be set?**
- (a) On each campaign.
- (b) One global number in Settings, shared by all campaigns.
- (c) Both: per campaign + a global cap (e.g. campaign A 300, campaign B 200, total never
  above 400).

Default suggestion: (a) now, add the global cap later if you run campaigns in parallel.

Answer: **(a) A step-1 target on each campaign, plus a platform daily SMS limit in Settings**
that you set: the maximum number of texts the platform may send in one day, across all
campaigns, step 1 and follow-ups included. When it's reached, campaign sending stops until
the next sending day. (2026-11-27)

**Q4b. Does the platform daily limit also count (and block) manual texts and AI replies?**
- (a) Counts and blocks everything: once the limit is hit, even a manual reply is refused.
- (b) Counts everything, but blocks only campaign texts: manual texts and AI replies still go
  out (people who texted you still get an answer), and they use up part of the day's limit.
- (c) Campaign texts only: manual texts and AI replies are neither counted nor blocked.

Default: (b).

Answer: **Default (b)** — manual texts and AI replies count towards the platform limit but
are never blocked by it; only campaign texts stop when the limit is reached. (2026-11-27)

**Q4c. When the platform limit is close, who goes first?** Default: follow-ups (step 2, 3, …)
before new step-1 contacts, so people already in a sequence aren't left hanging.

Answer: **Default** — follow-ups first, then new step-1 contacts. (2026-11-27)

**Q5. Follow-up steps (2, 3, …) have no daily limit in your rule — only the gap and window.
OK?** (e.g. on day 3 you could send 300 new step 1 + 280 step 2 + 250 step 3.)

Answer: **Yes.** The daily target counts only step 1 to new contacts; undelivered ones are
replaced by more new contacts until the target is reached. Follow-ups have no daily cap —
only the gap, sending window and sending days limit them. (2026-11-27)

Example, 3 steps, 1 day apart, target 300: Day 1 ≈ 300 · Day 2 ≈ 600 (300 new + ~300 step 2)
· Day 3 onward ≈ 900 (300 new + ~300 step 2 + ~300 step 3). Follow-ups are "≈" because only
contacts whose previous step was delivered, and who haven't replied/opted out, get them.

Consequences to keep in mind:
- The gap must fit the busiest day: 900 texts in a 12 h window needs a gap ≤ 48 s. If not,
  some follow-ups move to the next day, and the campaign page warns.
- Carriers' daily limit (10DLC, Q12) counts every text, follow-ups included.

**Q6. A step-1 text with no delivery report after 15 minutes — count it as delivered for
the target?** Default: yes (some carriers never confirm; otherwise the day stalls).

Answer: **No.** A text without a delivery report is never counted as delivered. (2026-11-27)

**Q6b. Then what happens to a "no report" text?** Twilio's last word is "sent" and the
carrier never confirms. To keep the day moving, after a waiting time (default 15 min) it
becomes **"no report"**:
- **For the daily target:** it stops holding a place, so the system tries another new
  contact. It is **not** counted as delivered.
- **For that contact's next steps** (Q2 says follow-ups wait for "delivered"):
  - (a) Treat like undelivered: no more steps, but **not** added to the do-not-text list
    (the text may well have arrived).
  - (b) Let follow-ups go ahead after the normal delay, as if delivered.
  - (c) Keep waiting; if a report arrives later (sometimes hours), carry on, otherwise stop
    after e.g. 24 h.

Default: (c) — wait up to 24 h for a late report, then stop that contact's steps without
adding them to the do-not-text list.

Answer: **Default (c).** (2026-11-27)

**What if the next step falls inside those 24 h while it's still unconfirmed?** It is
**held, never sent early.** A step's delay / minimum wait counts from the moment the
previous step is delivered (Q2), so its clock hasn't started yet:
- Late "delivered" arrives (e.g. 14:00 for a text sent at 10:00) → the next step becomes due
  its delay after 14:00, then goes out at the next allowed moment (gap, window, days).
- Fixed-date step whose date passes while unconfirmed → waits; after a late "delivered", it
  goes out once the minimum wait since delivery has passed.
- Nothing within 24 h → that contact's remaining steps are cancelled; the number is **not**
  added to the do-not-text list.

**Q6c. Waiting time before a text counts as "no report"?** Default: 15 minutes.

Answer: **Default — 15 minutes.** (2026-11-27)

---

## Undelivered rules

**Q7. Temporary errors — treat the same as permanent?**
- 30003 phone off / no signal · 30007 carrier spam filter · 30008 unknown
- (a) Same: any undelivered → excluded + do-not-text list.
- (b) Retry once later (e.g. next day) for 30003/30008; 30007 excluded but **not** added to the
  global list (it's usually our wording, not the number).

Default: (b).

Answer: **(a) Same as permanent.** Any undelivered / failed text, whatever the error code
(30003, 30007, 30008 included), excludes that contact from the campaign and puts the number
on the do-not-text list for all future campaigns. No retries. (2026-11-27)

Note: 30007 is usually caused by the message wording or sender registration, not the number,
so a wording problem can put good numbers on the list. The 10-in-a-row auto-pause (Q7b) and
removing numbers from the list by hand (Q8c) limit the damage.

**Q7b. "10 undelivered in a row" — count every error code, or only some?**
Default: every code. Then 10 × 30007 in a row (spam filter) pauses the campaign too —
usually exactly what you want.

Answer: **Every error code counts** — 30006, 30007 or any other undelivered / failed text adds
to the run of 10; a delivered text resets it to 0. (2026-11-27)

Also: **a Settings-page option for this auto-pause** — an on/off switch, and the number of
undelivered texts in a row that triggers it (default 10, you can change it). It applies to
every campaign. When it's off, campaigns never pause themselves; undelivered numbers are
still excluded and listed. (2026-11-27)

**Q7c. After an auto-pause, what restarts it?** Default: only you, with a Resume button.

Answer: **Default** — only you, with a Resume button on the campaign. It never restarts by
itself. Resuming resets the run counter to 0. (2026-11-27)

**Q8. Do-not-text list — also block manual texts and AI replies to those numbers, or
campaigns only?**
Default: campaigns only; manual send shows a warning "this number was undelivered on
<date> (30006)" but still lets you send.

Answer: **A Settings-page choice.** Campaigns are always blocked. For **manual texts** and
**AI replies** separately, you choose: **Block** or **Allow with a warning**. Starting
setting: both "Allow with a warning". (2026-11-27)

**Q8b. Should the import show do-not-text numbers?** E.g. in the preview as invalid:
"previously undelivered (30006)". Default: yes, shown and skipped.

Answer: **Default** — the import preview lists them as invalid, "previously undelivered
(30006)", and they are not imported. (2026-11-27)

**Q8c. Can you remove a number from the do-not-text list by hand?** (e.g. the person
switched carrier). Default: yes, from the contact page.

Answer: **Default** — yes, a "Remove from do-not-text list" button on the contact page; the
removal is written to the system log. (2026-11-27)

---

## Stop + remove pending numbers

**Q9. Which contacts count as "pending"?**
- (a) Never received step 1 (not started).
- (b) (a) + contacts in the middle of the sequence (step 1 delivered, step 2 not yet).

Default: (a) only.

Answer: **Default (a)** — only contacts who never received step 1. (2026-11-27)

**Q10. Pending contacts that are ALSO in another campaign, or have message history
(replies, manual texts) — delete them too?** Default: no, keep them.

Answer: **Default** — keep them: contacts also in another campaign, or with any message history (replies, manual texts), are not removed. (2026-11-27)

**Q11. "Remove" = soft delete (hidden, but restorable by us in the database) or permanent
delete?** Default: soft delete, same as the Contacts page delete.

Answer: **Default** — soft delete, same as deleting from the Contacts page. (2026-11-27)

**Q11b. Pause vs Stop:** Pause = resume later, nothing removed. Stop = final, toggle
applies. Two separate buttons OK?

Answer: **Default** — two buttons: **Pause** (resume later, nothing removed) and **Stop** (final; the remove-pending toggle applies). (2026-11-27)

---

## Schedule

**Q12. What is your 10DLC daily limit** (from your Twilio / carrier registration)? I'll show a
warning when a target is higher.

Answer: **2,000 a day**, and it must be changeable. It is the same setting as the
**platform daily SMS limit** (Q4) on the Settings page, pre-filled with 2,000; you can change
it any time (e.g. if your 10DLC tier changes). Campaign pages warn when their planned texts
for a day would go over it. (2026-11-27)

**Q13. "Until contacts run out" plus a day/week limit together — end at whichever comes
first?** Default: yes.

Answer: **Default** — end at whichever comes first. (2026-11-27)

**Q14. A step that falls on a non-sending day (e.g. Saturday) — move it to the next sending
day?** Default: yes.

Answer: **Default** — moved to the next sending day, never skipped. (2026-11-27)

**Q15. Can you add more contacts to a running campaign** (a second upload)? They'd join the
queue after the existing ones. Default: yes.

Answer: **Default** — yes; new contacts join the queue after those already waiting and get step 1 within the same daily target. (2026-11-27)

---

## Reports

**Q16. Anything else you need counted?** e.g. cost per campaign (Twilio price per text),
replies per step, export to CSV.

Answer: **Yes — show how much is spent on Twilio.** (2026-11-27)

**Q16b. Which spend view?**
- (a) **Whole account, today / this month** on the Dashboard, from Twilio usage data: SMS sent
  and received, lookups (line-type checks), number rental. Includes anything else using the
  same Twilio account.
- (b) **Per campaign**: FDGSMS fetches each message's price from Twilio after sending and shows
  e.g. "4,120 texts · $33.40 · $0.0081 per delivered text".
- (c) Both.

Default: (c) — (a) first (quick), (b) with the campaign report.

Answer: **(c) Both** — account spend today / this month on the Dashboard first, then cost per campaign in the campaign report. (2026-11-27)

**Q17. "Max Messages Per Run" disappears from Settings once the gap exists. Anything still
using it you know of?** Default: remove.

Answer: **Default — remove it.** The per-campaign gap replaces it; existing campaigns start with a **30-second gap** (you can change it per campaign). (2026-11-27)
