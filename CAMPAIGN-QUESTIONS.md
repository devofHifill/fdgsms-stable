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

Answer:

**Q2. A follow-up step — should it wait for the previous step to be *delivered*, or just *sent*?**
Default: wait for delivered (so we never send step 2 to a number whose step 1 failed).

Answer:

---

## Gap between texts

**Q3. Is the gap per campaign, or one gap shared by all campaigns?**
If two campaigns run at once with a 60 s gap each, per-campaign = up to 2 texts/minute from
your number; shared = 1 text/minute total. Default: **per campaign**, plus the shared
sending window.

Answer:

**Q3b. Smallest gap allowed?** Default: 5 seconds (below that carriers see a burst).

Answer:

---

## Daily target

**Q4. Where should the daily target (e.g. 300) be set?**
- (a) On each campaign.
- (b) One global number in Settings, shared by all campaigns.
- (c) Both: per campaign + a global cap (e.g. campaign A 300, campaign B 200, total never
  above 400).

Default suggestion: (a) now, add the global cap later if you run campaigns in parallel.

Answer:

**Q5. Follow-up steps (2, 3, …) have no daily limit in your rule — only the gap and window.
OK?** (e.g. on day 3 you could send 300 new step 1 + 280 step 2 + 250 step 3.)

Answer:

**Q6. A step-1 text with no delivery report after 15 minutes — count it as delivered for
the target?** Default: yes (some carriers never confirm; otherwise the day stalls).

Answer:

---

## Undelivered rules

**Q7. Temporary errors — treat the same as permanent?**
- 30003 phone off / no signal · 30007 carrier spam filter · 30008 unknown
- (a) Same: any undelivered → excluded + do-not-text list.
- (b) Retry once later (e.g. next day) for 30003/30008; 30007 excluded but **not** added to the
  global list (it's usually our wording, not the number).

Default: (b).

Answer:

**Q7b. "10 undelivered in a row" — count every error code, or only some?**
Default: every code. Then 10 × 30007 in a row (spam filter) pauses the campaign too —
usually exactly what you want.

Answer:

**Q7c. After an auto-pause, what restarts it?** Default: only you, with a Resume button.

Answer:

**Q8. Do-not-text list — also block manual texts and AI replies to those numbers, or
campaigns only?**
Default: campaigns only; manual send shows a warning "this number was undelivered on
<date> (30006)" but still lets you send.

Answer:

**Q8b. Should the import show do-not-text numbers?** E.g. in the preview as invalid:
"previously undelivered (30006)". Default: yes, shown and skipped.

Answer:

**Q8c. Can you remove a number from the do-not-text list by hand?** (e.g. the person
switched carrier). Default: yes, from the contact page.

Answer:

---

## Stop + remove pending numbers

**Q9. Which contacts count as "pending"?**
- (a) Never received step 1 (not started).
- (b) (a) + contacts in the middle of the sequence (step 1 delivered, step 2 not yet).

Default: (a) only.

Answer:

**Q10. Pending contacts that are ALSO in another campaign, or have message history
(replies, manual texts) — delete them too?** Default: no, keep them.

Answer:

**Q11. "Remove" = soft delete (hidden, but restorable by us in the database) or permanent
delete?** Default: soft delete, same as the Contacts page delete.

Answer:

**Q11b. Pause vs Stop:** Pause = resume later, nothing removed. Stop = final, toggle
applies. Two separate buttons OK?

Answer:

---

## Schedule

**Q12. What is your 10DLC daily limit** (from your Twilio / carrier registration)? I'll show a
warning when a target is higher.

Answer:

**Q13. "Until contacts run out" plus a day/week limit together — end at whichever comes
first?** Default: yes.

Answer:

**Q14. A step that falls on a non-sending day (e.g. Saturday) — move it to the next sending
day?** Default: yes.

Answer:

**Q15. Can you add more contacts to a running campaign** (a second upload)? They'd join the
queue after the existing ones. Default: yes.

Answer:

---

## Reports

**Q16. Anything else you need counted?** e.g. cost per campaign (Twilio price per text),
replies per step, export to CSV.

Answer:

**Q17. "Max Messages Per Run" disappears from Settings once the gap exists. Anything still
using it you know of?** Default: remove.

Answer:
