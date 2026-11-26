# FDGSMS — Fix Plan & Tracker

Created 2026-11-10 from the code review. One fix at a time, each on its own branch,
merged to `staging` → tested on the staging site → promoted to `main`.

**Status key:** ⬜ To do · 🟨 In progress · 🟦 In review (PR open) · 🧪 On staging, testing · ✅ Done (on main) · ⏸ Waiting on a decision

## Tracker

| #  | Fix | Severity | Status | Branch | PR |
|----|-----|----------|--------|--------|----|
| 1  | Verify Twilio signature on webhooks | 🔴 Critical | ✅ | `fix/twilio-webhook-signature` | [#44](https://github.com/devofHifill/fdgsms-stable/pull/44) → main [#47](https://github.com/devofHifill/fdgsms-stable/pull/47) |
| 2  | "Yes" reply treated as opt-in, not a reply | 🔴 Critical | ✅ | `fix/yes-reply-not-opt-in` | [#45](https://github.com/devofHifill/fdgsms-stable/pull/45) → main [#47](https://github.com/devofHifill/fdgsms-stable/pull/47) |
| 3  | AI replies can be sent twice (overlapping runs) | 🔴 Critical | ✅ | `fix/worker-atomic-claim` | [#48](https://github.com/devofHifill/fdgsms-stable/pull/48) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 4  | AI jobs stuck in "processing" forever | 🟠 High | ✅ | `fix/worker-atomic-claim` (with #3) | [#48](https://github.com/devofHifill/fdgsms-stable/pull/48) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 5  | AI sees oldest 50 messages, not newest | 🟠 High | ✅ | `fix/ai-history-latest` | [#51](https://github.com/devofHifill/fdgsms-stable/pull/51) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 6  | Sending window uses UTC, AI ignores it | 🟠 High | ✅ | `fix/sending-window-timezone` | [#60](https://github.com/devofHifill/fdgsms-stable/pull/60) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 7  | Uploaded contact files never deleted | 🟡 Medium | ✅ | `fix/upload-file-cleanup` | [#52](https://github.com/devofHifill/fdgsms-stable/pull/52) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 8  | Encrypt Twilio auth token in the DB | 🟡 Medium | ✅ | `fix/encrypt-twilio-token` | [#58](https://github.com/devofHifill/fdgsms-stable/pull/58) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 9  | Login hardening (attempt limit, safe compare) | 🟡 Medium | ✅ | `fix/login-hardening` | [#56](https://github.com/devofHifill/fdgsms-stable/pull/56) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 10 | Client: sign out on expired login (401) | 🟡 Medium | ✅ | `fix/client-401-logout` | [#53](https://github.com/devofHifill/fdgsms-stable/pull/53) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 11 | Ignore duplicate inbound texts (Twilio resends) | 🟡 Medium | ✅ | `fix/inbound-dedupe` | [#54](https://github.com/devofHifill/fdgsms-stable/pull/54) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 12 | Missing opt-out keywords ("stop all", "revoke") | 🟡 Medium | ✅ | `fix/opt-out-keywords` | [#55](https://github.com/devofHifill/fdgsms-stable/pull/55) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 13 | Readable errors for bad/oversized uploads | 🟢 Low | ✅ | `chore/error-handler` | [#59](https://github.com/devofHifill/fdgsms-stable/pull/59) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 14 | Escape Logs page search input | 🟢 Low | ✅ | `chore/error-handler` (with #13) | [#59](https://github.com/devofHifill/fdgsms-stable/pull/59) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 15 | Remove hardcoded IP from CORS list | 🟢 Low | ✅ | `chore/cleanup` | [#57](https://github.com/devofHifill/fdgsms-stable/pull/57) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 16 | Remove dead commented code + stray root file | 🟢 Low | ✅ | `chore/cleanup` (with #15) | [#57](https://github.com/devofHifill/fdgsms-stable/pull/57) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |
| 17 | AI system logs never saved (`ai` not an allowed log category) | 🟠 High | ✅ | `fix/systemlog-ai-category` | [#50](https://github.com/devofHifill/fdgsms-stable/pull/50) → staging → main [#62](https://github.com/devofHifill/fdgsms-stable/pull/62) |


**Progress:** 17 / 17 done — all on `main` and checked on live (2026-11-26)

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

### 6. Sending window timezone — 🟠 High — decided 2026-11-26: option A, AI answers anytime
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

**Done (on `fix/sending-window-timezone`):**
- New `server/utils/timezone.js`: `isWithinSendingWindow(now, window, timeZone)` reads the hour
  with `Intl.DateTimeFormat` (`hourCycle: "h23"`), so DST is handled; invalid zone → Eastern.
- `AutomationSettings.timezone` (default `America/New_York`); the settings API validates it
  (unknown zone → 400) and the campaign worker uses it. AI worker unchanged, per the decision.
- Settings page: timezone picker (US zones + UTC) above Start/End Hour, showing the current time
  in that zone and a note that AI replies aren't limited by the hours.
- Checked: `server/tests/timezone.test.js` (winter/summer, Phoenix, wrap-around window, the old
  UTC behaviour); in the browser: picker shows Eastern + current time, Central saves and stays
  after reload; bad zone via API → 400.
- ⚠️ On deploy, servers with no saved timezone switch from UTC to Eastern: a 9–18 window moves
  from 4am–1pm Eastern to 9am–6pm Eastern. Check the hours on the Settings page after deploying.

### 7. Uploaded contact files never deleted — 🟡 Medium
**Problem:** every preview leaves a CSV/XLSX full of PII in `uploads/`.
**Plan:** delete the file in a `finally` after parsing in `uploadPreview` (import already
receives rows from the client, so the file isn't needed later). One-off: clear the existing
`uploads/` folder on each server.
**Files:** `server/controllers/contactImportController.js`.
**How to verify:** run a preview → `uploads/` stays empty; import still works.

**Done (on `fix/upload-file-cleanup`):**
- `uploadPreview` deletes the uploaded file in a `finally`, on success and on every error path
  (`readColumns` already did this).
- Checked locally through the API with `sample.csv`: read columns, preview, and a preview that
  fails on a bad mapping all leave `server/uploads/` empty. Import is untouched (it uses the rows
  the client sends back).
- One-off on each server: `uploads/` is not a Docker volume, so old files go when the server
  container is recreated on deploy; a plain restart keeps them. Check after deploying:
  `docker exec fdgsms-server ls uploads`.

### 8. Encrypt Twilio auth token — 🟡 Medium
**Plan:** reuse `utils/secretBox.js` (`encryptSecret` on save, `decryptSecret` in
`getActiveTwilioConfig`, `maskSecret` for display). Plaintext values keep working
(secretBox passes them through) and get encrypted on next save.
**Files:** `server/controllers/twilioSettingsController.js`, `server/services/twilioService.js`.
**How to verify:** save token → DB shows `enc:v1:…`; sending still works.

**Done (on `fix/encrypt-twilio-token`):**
- Saving a token stores it with `encryptSecret`; `getActiveTwilioConfig` decrypts it
  (`readStoredAuthToken`), so sending and the webhook signature check get the real token.
- Settings page shows `maskSecret` (last 4 only), never the token or ciphertext.
- Existing plain-text tokens are encrypted once at server start (`encryptStoredTwilioToken` in
  `index.js`) and on any settings save, so live doesn't wait for someone to re-enter it.
- A token that no longer decrypts logs a clear console error.
- Checked: `server/tests/twilioToken.test.js`, plus a throwaway-DB run with a fake token (startup
  encryption, idempotent re-run, masked GET, blank-token save keeps it, new token round-trips).
  Not checked against real Twilio — do that on staging (send a text + receive one).
- ⚠️ The key is derived from `AI_SECRET_KEY`, else `JWT_SECRET`. Changing that value on a server
  makes the stored token unreadable → sending fails and every inbound webhook gets 403 until the
  token is re-entered. The AI key has the same dependency.

### 9. Login hardening — 🟡 Medium
**Plan:** `crypto.timingSafeEqual` compare; simple in-memory attempt limiter (e.g. 10 tries /
15 min per IP, respecting `X-Forwarded-For` from Traefik); consider shorter token life (e.g. 1d).
**Files:** `server/controllers/authController.js`, `server/routes/authRoutes.js`, `server/index.js` (`trust proxy`).
**How to verify:** 11th wrong attempt → 429; correct login still works.

**Done (on `fix/login-hardening`):**
- Email and password compared with `crypto.timingSafeEqual` (over SHA-256, so length doesn't
  leak); both always checked. Email is now case-insensitive.
- `server/utils/attemptLimiter.js` (new), in memory: 10 failed logins per IP and 50 in total per
  15 min → `429` with `Retry-After`. A successful login clears that IP. Lockout writes an
  `auth` warn log (`login_rate_limited`).
- `app.set("trust proxy", 1)` so `req.ip` is the real client behind Traefik.
- Checked: `server/tests/loginLimit.test.js`; and on the local API: correct login 200, 10 wrong
  → 401, 11th → 429, right password from that IP → 429, other IP still logs in.
- Trade-offs: the global cap means a sustained attack can lock the real admin out for up to
  15 min (better than unlimited guesses). Port `5000:4000` is published directly in
  `docker-compose.yml`, bypassing Traefik, so `X-Forwarded-For` can be faked there — the global
  cap still holds. Closing that port (or binding it to `127.0.0.1`) would be a good follow-up.
- Token life not changed: still `JWT_EXPIRES_IN` (default `7d`), set per server in `.env`.

### 10. Client: sign out on expired login — 🟡 Medium
**Plan:** in `apiFetch`, on `401` clear token/user and redirect to `/login` (skip for the login
call itself).
**Files:** `client/src/services/api.js`, maybe `client/src/context/AuthContext.jsx`.
**How to verify:** put a bad token in localStorage → app returns to login page.

**Done (on `fix/client-401-logout`):**
- `apiFetch`: a `401` on a request that carried the token clears `token`/`user` and fires
  `fdgsms:auth-expired`. The login call sends no token, so a wrong password just shows its error.
- `AuthContext` listens and signs out; `ProtectedRoute` then shows `/login` (no full reload).
- Only `requireAuth` and login return 401 on the server, so nothing else triggers it.
- Checked in the browser: bad token on `/contacts` → `/login` with storage cleared; wrong
  password → "Invalid email or password", stays on login; correct login → dashboard.

### 11. Ignore duplicate inbound texts — 🟡 Medium
**Plan:** before saving, check for an existing inbound message with the same `MessageSid`;
if found, return 200 and skip. Optionally a partial unique index on inbound `providerMessageSid`.
**Files:** `server/controllers/webhookController.js`, maybe `server/models/SMSMessage.js`.
**How to verify:** POST the same signed payload twice → one message, one AI job.

**Done (on `fix/inbound-dedupe`):**
- Inbound webhook looks up `MessageSid` first; a repeat answers `200` and is skipped (writes an
  `inbound_sms_duplicate` info log).
- Partial unique index `uniq_inbound_provider_sid` on inbound `providerMessageSid` (non-empty),
  so two copies arriving at the same moment can't both save; the loser gets `200` too.
  Outbound rows and rows without a sid are exempt.
- Checked on a throwaway DB: same text twice → 1 message, unread +1; 3 at once → 1 message;
  different text still saves.
- Before deploying, check for old duplicates (they'd stop the index building; dedupe still works
  via the lookup, mongoose just logs the index error):
  `db.smsmessages.aggregate([{$match:{direction:"inbound",providerMessageSid:{$gt:""}}},{$group:{_id:"$providerMessageSid",n:{$sum:1}}},{$match:{n:{$gt:1}}}])`

### 12. Missing opt-out keywords — 🟡 Medium
**Plan:** add `revoke`, and match `stop all` (with space) by collapsing spaces before lookup.
Keep the exact-whole-message rule so "stop by later" is still not an opt-out.
**Files:** `server/utils/optOut.js`.
**How to verify:** small `node --test` for the keyword classifier.

**Done (on `fix/opt-out-keywords`):**
- `revoke` added to the opt-out words.
- Spaces are removed before matching, so `STOP ALL`, `stop  all`, `OPT OUT` and `Opt in` match
  `stopall` / `optout` / `optin`. The whole message must still be the keyword: "stop by later",
  "the end", "cancel my 3pm?" stay normal replies.
- Checked: `server/tests/optOut.test.js` (10 tests).

### 13. Readable errors for bad uploads — 🟢 Low
**Plan:** add a final Express error handler that turns `MulterError` / file-type errors into
`400 { message }` JSON, everything else into `500 { message }`.
**Files:** `server/index.js`.
**How to verify:** upload a `.pdf` or a 15 MB file → clear message in the UI.

**Done (on `chore/error-handler`):**
- New `server/middleware/errorHandler.js`, registered last in `index.js`: every unhandled error
  becomes JSON `{ message }`, which the client already shows.
  - Upload size/field errors → 400 ("File is too large. The limit is 10 MB.").
  - Wrong file type (now tagged 400 in `uploadMiddleware.js`) → its own message.
  - Broken JSON → 400; oversized body → 413; CORS rejection (now tagged 403) → 403.
  - Anything else → 500 "Something went wrong on the server." (details only in the server log).
- Checked: `server/tests/errorHandler.test.js`; and on the local API: `.pdf` → 400 file-type
  message, 15 MB CSV → 400 size message, bad JSON → 400, unknown origin → 403, good CSV → 200.
  Not clicked through the Upload page (the pane can't pick local files); the page shows `message`.

**#14 done (same branch):**
- `escapeRegex` moved to new `server/utils/regex.js`; used by the Contacts search (unchanged
  behaviour) and now the Logs search, so text is matched literally.
- Checked: `server/tests/regex.test.js`; local API: Logs search `(`, `a+`, `[` → normal empty
  result instead of an error; `upload_preview` still finds entries; Contacts search `(` fine.

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

**#15 + #16 done (on `chore/cleanup`):**
- `http://82.25.109.223:5175` removed from the CORS list. Checked first: that address still serves
  the app, but its `/api` returns the HTML page (the `serve` container has no API), so the app
  there can't reach the API and the entry did nothing. The real sites use `CLIENT_URL`.
- Removed the commented-out first version at the top of `server/index.js` (29 lines) and
  `server/routes/contactImportRoutes.js` (16 lines).
- Deleted `Below is a developer-grade, task-by-task.txt`: same as `Phases.txt` except one stray
  "new twilio" line and blank lines, so nothing to merge.
- Checked locally: API starts, local site logs in (CORS 200), the IP origin is refused, tests pass.
  The refusal shows as 500 on this branch and becomes 403 once #13's error handler is merged.

---

## Decisions log

| Date | Fix | Decision |
|------|-----|----------|
| 2026-11-26 | #6 | A. One account timezone, set on the Settings page (default America/New_York). AI replies are NOT held by the window — they answer anytime, since the contact texted first. |

## Change log

| Date | Fix | What happened |
|------|-----|---------------|
| 2026-11-10 | — | Plan created from code review |
| 2026-11-26 | #3, #4 | Merged to staging in #48 |
| 2026-11-26 | #5–#17 | All merged to staging in #50–#60 |
| 2026-11-26 | #3–#17 | Promoted to main in #62, deployed live and checked there (SMS in/out, opt-out, AI drafts; #9 checked locally only) |
