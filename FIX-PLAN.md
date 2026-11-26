# FDGSMS — Fix Plan & Tracker

Created 2026-11-10 from the code review. One fix at a time, each on its own branch,
merged to `staging` → tested on the staging site → promoted to `main`.

**Status key:** ⬜ To do · 🟨 In progress · 🟦 In review (PR open) · 🧪 On staging, testing · ✅ Done (on main) · ⏸ Waiting on a decision

## Tracker

| #  | Fix | Severity | Status | Branch | PR |
|----|-----|----------|--------|--------|----|
| 1  | Verify Twilio signature on webhooks | 🔴 Critical | ✅ | `fix/twilio-webhook-signature` | [#44](https://github.com/devofHifill/fdgsms-stable/pull/44) → main [#47](https://github.com/devofHifill/fdgsms-stable/pull/47) |
| 2  | "Yes" reply treated as opt-in, not a reply | 🔴 Critical | ✅ | `fix/yes-reply-not-opt-in` | [#45](https://github.com/devofHifill/fdgsms-stable/pull/45) → main [#47](https://github.com/devofHifill/fdgsms-stable/pull/47) |
| 3  | AI replies can be sent twice (overlapping runs) | 🔴 Critical | 🧪 | `fix/worker-atomic-claim` | [#48](https://github.com/devofHifill/fdgsms-stable/pull/48) → staging |
| 4  | AI jobs stuck in "processing" forever | 🟠 High | 🧪 | `fix/worker-atomic-claim` (with #3) | [#48](https://github.com/devofHifill/fdgsms-stable/pull/48) → staging |
| 5  | AI sees oldest 50 messages, not newest | 🟠 High | 🟨 | `fix/ai-history-latest` | |
| 6  | Sending window uses UTC, AI ignores it | 🟠 High | ⏸ | `fix/sending-window-timezone` | |
| 7  | Uploaded contact files never deleted | 🟡 Medium | ⬜ | `fix/upload-file-cleanup` | |
| 8  | Encrypt Twilio auth token in the DB | 🟡 Medium | ⬜ | `fix/encrypt-twilio-token` | |
| 9  | Login hardening (attempt limit, safe compare) | 🟡 Medium | ⬜ | `fix/login-hardening` | |
| 10 | Client: sign out on expired login (401) | 🟡 Medium | ⬜ | `fix/client-401-logout` | |
| 11 | Ignore duplicate inbound texts (Twilio resends) | 🟡 Medium | ⬜ | `fix/inbound-dedupe` | |
| 12 | Missing opt-out keywords ("stop all", "revoke") | 🟡 Medium | ⬜ | `fix/opt-out-keywords` | |
| 13 | Readable errors for bad/oversized uploads | 🟢 Low | ⬜ | `chore/error-handler` | |
| 14 | Escape Logs page search input | 🟢 Low | ⬜ | `chore/error-handler` (with #13) | |
| 15 | Remove hardcoded IP from CORS list | 🟢 Low | ⬜ | `chore/cleanup` | |
| 16 | Remove dead commented code + stray root file | 🟢 Low | ⬜ | `chore/cleanup` (with #15) | |
| 17 | AI system logs never saved (`ai` not an allowed log category) | 🟠 High | 🟨 | `fix/systemlog-ai-category` | |

**Progress:** 2 / 17 done

---

## Workflow for each fix

1. `git checkout staging && git pull` → `git checkout -b <branch>`
2. Make the change (only the files listed for that fix).
3. Run the checks listed under **How to verify**.
4. Commit, open PR into `staging`, update this tracker (status 🟦 + PR link).
5. After it's tested on staging and promoted to `main`, mark ✅.

> No automated tests exist yet. Pure helpers (keyword matching, guardrails, window
> check) can get small `node --test` tests as we touch them — no new dependencies.

---

## Fix details

### 1. Verify Twilio signature on webhooks — 🔴 Critical
**Problem:** `/api/webhooks/twilio/inbound` and `/status` accept any POST. Anyone with the
URL can fake texts → opt contacts out, stop campaigns, trigger paid AI replies to real numbers.
**Plan:**
- New middleware `server/middleware/twilioSignature.js` using `twilio.validateRequest()`
  with the auth token from `getActiveTwilioConfig()` (DB first, then env).
- Rebuild the public URL correctly behind Traefik: `https://${APP_DOMAIN}${req.originalUrl}`
  (add `PUBLIC_BASE_URL` env, fall back to `X-Forwarded-Proto` + `Host`).
- Reject invalid signatures with `403` and a `warn` system log.
- Dev escape hatch: `TWILIO_WEBHOOK_VALIDATE=false` (default on; document in `.env.example`).
**Files:** `server/middleware/twilioSignature.js` (new), `server/routes/webhookRoutes.js`,
`docker-compose.yml`, `.env.example`, `server/.env.example`.
**How to verify:** unsigned `curl` POST → 403; real text to the Twilio number on staging → saved
in Inbox; delivery status still updates.
**Risk:** a wrong URL makes every real webhook fail → test on staging before main.

### 2. "Yes" reply treated as opt-in — 🔴 Critical
**Problem:** "yes" is an opt-in keyword and the webhook returns early, so a normal "Yes" reply
doesn't stop the campaign, resets status to "active", and gets no AI reply.
**Plan:** only treat START-type keywords as opt-in **when the contact is currently opted out**.
Otherwise fall through to normal reply handling (mark replied, stop enrollments, enqueue AI).
**Files:** `server/controllers/webhookController.js` (and maybe `server/utils/optOut.js`).
**How to verify:** active enrolled contact replies "Yes" → enrollment stopped, status replied,
AI job created. Opted-out contact sends "START" → opted back in.

### 3. AI replies can be sent twice — 🔴 Critical
**Problem:** AI worker runs every 20s, a batch of 10 LLM calls can take longer, the next run
grabs the same pending jobs → double send. Campaign worker has the same risk past 60s.
**Plan:**
- Claim each job atomically: `findOneAndUpdate({ _id, status: "pending" }, { status: "processing", claimedAt: now, $inc: { attempts: 1 } })` — skip if null.
- Add an in-process "already running" flag to both `runAiReplyCycle` and `runAutomationCycle`
  so runs never overlap.
- Campaign worker: claim each enrollment atomically too (e.g. set `nextSendAt` to a lock
  time before sending) so a step can't send twice.
**Files:** `server/jobs/aiReplyWorker.js`, `server/jobs/automationWorker.js`,
`server/models/AiReplyJob.js` (add `claimedAt`).
**How to verify:** temporarily add an artificial delay → only one SMS per job/step in logs.

### 4. AI jobs stuck in "processing" — 🟠 High (same branch as #3)
**Problem:** a restart mid-job leaves it "processing" forever and blocks all future AI replies
for that contact.
**Plan:** at the start of each AI cycle, reset jobs `processing` with `claimedAt` older than
5 minutes back to `pending` (or `failed` if attempts exhausted). One-off: existing stuck jobs
(no `claimedAt`) get reset by the same rule using `updatedAt`.
**Files:** `server/jobs/aiReplyWorker.js`.
**How to verify:** set a job to `processing` with an old timestamp → next cycle recovers it.

**Done (#3 + #4, merged to `staging` in [#48](https://github.com/devofHifill/fdgsms-stable/pull/48) on 2026-11-26; not on `main` yet):**
- `server/utils/singleFlight.js` (new): both `runAiReplyCycle` and `runAutomationCycle` skip a
  tick while the previous run is still going.
- AI worker claims each job with one `findOneAndUpdate` (pending → processing, sets `claimedAt`,
  `attempts + 1`); a job claimed elsewhere is skipped.
- Each AI cycle first recovers jobs stuck in `processing` for 5+ min (by `claimedAt`, or
  `updatedAt` for old jobs): back to `pending`, or `failed` if out of attempts.
- Campaign worker claims the enrollment step right before sending by pushing `nextSendAt`
  10 min ahead, matching on the step and time it read; a step already taken, rescheduled or
  stopped (e.g. the contact replied) is not sent.
- Checked: `server/tests/singleFlight.test.js`, plus a throwaway-DB run: 5 racing claims → 1 job
  sent; 2 racing campaign runs → 1 step sent; stuck jobs recovered, fresh ones left alone.
- Known limit: if the server dies *after* Twilio accepted a text but *before* the result is
  saved, the recovered job/step is retried once, so that one text can go out twice. Rare; needs
  an idempotency key to close fully.

### 17. AI system logs never saved — 🟠 High
**Problem:** `SystemLog.category` only allows sms/upload/webhook/automation/auth/api/system.
Every `category: "ai"` log (reply sent, skipped, drafted, errors, recovered jobs) fails validation
and is dropped with only a console line, so the AI Analytics page's activity list is always empty.
**Plan:** add `"ai"` to the enum in `server/models/SystemLog.js`.
**How to verify:** AI test reply or a skipped job → entry shows on the Logs page under AI.

**Done (on `fix/systemlog-ai-category`):**
- `"ai"` added to the `SystemLog.category` enum; it was the only category the server writes
  that was missing.
- Logs page category filter gets an "AI" option (`client/src/pages/LogsPage.jsx`).
- Checked: `server/tests/systemLog.test.js` (ai and all other used categories pass, unknown still
  rejected); locally, saving AI Settings now writes `ai_settings_updated`, shown under the AI filter.
- AI logs from before this fix were never stored, so the AI history starts from the deploy.

### 5. AI sees oldest 50 messages — 🟠 High
**Problem:** history query sorts oldest-first then `limit(50)` → long threads lose the latest
messages, including the one being answered.
**Plan:** sort newest-first, limit 50, then reverse to oldest-first before building the prompt.
**Files:** `server/jobs/aiReplyWorker.js` (and check `aiAnalyticsController.js` test-reply path).
**How to verify:** contact with 60+ messages → prompt includes the latest inbound.

**Done (on `fix/ai-history-latest`):**
- New `server/services/aiHistoryService.js` → `getRecentAiHistory(contactId)`: newest 50
  (`createdAt` desc, `_id` tie-break), reversed to oldest-first.
- Used by both the AI worker and the AI Analytics test-reply endpoint, which had the same bug.
- Checked on a throwaway DB: 65-message thread → messages 16–65, latest inbound last and only
  once in the prompt. The old query stopped at message 50.
- Note: `buildMessages` sends only the last 10 of those to the model (`DEFAULT_MEMORY_DEPTH`),
  so the model saw 10 *old* messages before this fix and now sees the 10 newest.

### 6. Sending window timezone — 🟠 High — ⏸ needs a decision
**Problem:** window uses server clock (UTC in Docker); 9–18 = ~4am–1pm Eastern. AI replies
ignore the window entirely.
**Decision needed:**
- **A. One account timezone** (e.g. `America/New_York`) setting on the Settings page — simple.
- **B. Per-contact timezone** from area code / state — correct for national lists, more work.
- And: should AI replies follow quiet hours too (hold until morning), or answer anytime since
  the contact texted first?
**Plan (option A):** add `timezone` to `AutomationSettings`, compute hour with
`Intl.DateTimeFormat(..., { timeZone, hour: "numeric", hourCycle: "h23" })`, add selector in
Settings UI.
**Files:** `server/models/AutomationSettings.js`, `server/jobs/automationWorker.js`,
`server/controllers/automationSettingsController.js`, `client/src/pages/SettingsPage.jsx`,
possibly `server/jobs/aiReplyWorker.js`.
**How to verify:** set window to the current Eastern hour ±1 → sends inside, holds outside.

### 7. Uploaded contact files never deleted — 🟡 Medium
**Problem:** every preview leaves a CSV/XLSX full of PII in `uploads/`.
**Plan:** delete the file in a `finally` after parsing in `uploadPreview` (import already
receives rows from the client, so the file isn't needed later). One-off: clear the existing
`uploads/` folder on each server.
**Files:** `server/controllers/contactImportController.js`.
**How to verify:** run a preview → `uploads/` stays empty; import still works.

### 8. Encrypt Twilio auth token — 🟡 Medium
**Plan:** reuse `utils/secretBox.js` (`encryptSecret` on save, `decryptSecret` in
`getActiveTwilioConfig`, `maskSecret` for display). Plaintext values keep working
(secretBox passes them through) and get encrypted on next save.
**Files:** `server/controllers/twilioSettingsController.js`, `server/services/twilioService.js`.
**How to verify:** save token → DB shows `enc:v1:…`; sending still works.

### 9. Login hardening — 🟡 Medium
**Plan:** `crypto.timingSafeEqual` compare; simple in-memory attempt limiter (e.g. 10 tries /
15 min per IP, respecting `X-Forwarded-For` from Traefik); consider shorter token life (e.g. 1d).
**Files:** `server/controllers/authController.js`, `server/routes/authRoutes.js`, `server/index.js` (`trust proxy`).
**How to verify:** 11th wrong attempt → 429; correct login still works.

### 10. Client: sign out on expired login — 🟡 Medium
**Plan:** in `apiFetch`, on `401` clear token/user and redirect to `/login` (skip for the login
call itself).
**Files:** `client/src/services/api.js`, maybe `client/src/context/AuthContext.jsx`.
**How to verify:** put a bad token in localStorage → app returns to login page.

### 11. Ignore duplicate inbound texts — 🟡 Medium
**Plan:** before saving, check for an existing inbound message with the same `MessageSid`;
if found, return 200 and skip. Optionally a partial unique index on inbound `providerMessageSid`.
**Files:** `server/controllers/webhookController.js`, maybe `server/models/SMSMessage.js`.
**How to verify:** POST the same signed payload twice → one message, one AI job.

### 12. Missing opt-out keywords — 🟡 Medium
**Plan:** add `revoke`, and match `stop all` (with space) by collapsing spaces before lookup.
Keep the exact-whole-message rule so "stop by later" is still not an opt-out.
**Files:** `server/utils/optOut.js`.
**How to verify:** small `node --test` for the keyword classifier.

### 13. Readable errors for bad uploads — 🟢 Low
**Plan:** add a final Express error handler that turns `MulterError` / file-type errors into
`400 { message }` JSON, everything else into `500 { message }`.
**Files:** `server/index.js`.
**How to verify:** upload a `.pdf` or a 15 MB file → clear message in the UI.

### 14. Escape Logs search — 🟢 Low (with #13)
**Plan:** reuse the existing `escapeRegex` from `contactController.js` (move to `utils/`).
**Files:** `server/controllers/systemLogController.js`, `server/controllers/contactController.js`, new `server/utils/regex.js`.
**How to verify:** search `(` on Logs page → no error.

### 15. Remove hardcoded IP from CORS — 🟢 Low
**Plan:** drop `http://82.25.109.223:5175`; rely on `CLIENT_URL`. Confirm nothing still uses
the IP:port address first.
**Files:** `server/index.js`.

### 16. Remove dead code + stray file — 🟢 Low (with #15)
**Plan:** delete commented-out blocks at the top of `server/index.js` and
`server/routes/contactImportRoutes.js`; move or delete `Below is a developer-grade, task-by-task.txt`
(merge into `Phases.txt` if still useful).

---

## Decisions log

| Date | Fix | Decision |
|------|-----|----------|
| | #6 | _Pending: account timezone vs per-contact; AI quiet hours yes/no_ |

## Change log

| Date | Fix | What happened |
|------|-----|---------------|
| 2026-11-10 | — | Plan created from code review |
