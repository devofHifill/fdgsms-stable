// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeTwilioError, shouldApplyStatus } from "../utils/twilioErrors.js";
import { getStatusCallbackUrl } from "../services/twilioService.js";

test("30007 is a temporary carrier-filter error", () => {
  const e = describeTwilioError(30007);
  assert.equal(e.code, "30007");
  assert.equal(e.permanent, false);
  assert.match(e.message, /^30007 — .*spam filter/);
});

test("30006 and 30005 are permanent and mark the number invalid", () => {
  for (const code of ["30006", "30005"]) {
    const e = describeTwilioError(code);
    assert.equal(e.permanent, true, code);
    assert.equal(e.contactInvalid, true, code);
  }
});

test("30004 (blocked) is permanent but the number itself is fine", () => {
  const e = describeTwilioError("30004");
  assert.equal(e.permanent, true);
  assert.equal(e.contactInvalid, false);
});

test("unknown codes get a generic label; blank codes return null", () => {
  assert.match(describeTwilioError("39999").message, /^39999 — Twilio error/);
  assert.equal(describeTwilioError(""), null);
  assert.equal(describeTwilioError(undefined), null);
});

test("status only moves forward, never back from a final state", () => {
  assert.equal(shouldApplyStatus("accepted", "sent"), true);
  assert.equal(shouldApplyStatus("sent", "delivered"), true);
  assert.equal(shouldApplyStatus("sent", "undelivered"), true);
  assert.equal(shouldApplyStatus("delivered", "sent"), false);
  assert.equal(shouldApplyStatus("undelivered", "sending"), false);
  assert.equal(shouldApplyStatus("accepted", "bogus"), false);
});

test("status callback URL needs a public https base", () => {
  const saved = process.env.PUBLIC_BASE_URL;
  try {
    process.env.PUBLIC_BASE_URL = "https://fdgsms.example.com/";
    assert.equal(getStatusCallbackUrl(), "https://fdgsms.example.com/api/webhooks/twilio/status");
    process.env.PUBLIC_BASE_URL = "http://localhost:4001";
    assert.equal(getStatusCallbackUrl(), "");
    process.env.PUBLIC_BASE_URL = "";
    assert.equal(getStatusCallbackUrl(), "");
  } finally {
    if (saved === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = saved;
  }
});
