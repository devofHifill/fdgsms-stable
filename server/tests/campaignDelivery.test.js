// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextSendAfterDelivery,
  isFinalFailure,
  RECIPIENT_SEND_ERROR_CODES,
  NO_REPORT_AFTER_MS,
  LATE_REPORT_WINDOW_MS,
} from "../services/campaignDeliveryService.js";
import { describeListing } from "../services/doNotTextService.js";

test("next step is due its delay after DELIVERY, not after sending", () => {
  const deliveredAt = new Date("2026-11-27T14:00:00Z");
  const oneHour = 60 * 60 * 1000;
  assert.equal(nextSendAfterDelivery(deliveredAt, oneHour).toISOString(), "2026-11-27T15:00:00.000Z");
  assert.equal(nextSendAfterDelivery(deliveredAt, 0).toISOString(), "2026-11-27T14:00:00.000Z");
  assert.equal(nextSendAfterDelivery(deliveredAt, null).toISOString(), "2026-11-27T14:00:00.000Z");
});

test("only undelivered and failed are final failures", () => {
  assert.equal(isFinalFailure("undelivered"), true);
  assert.equal(isFinalFailure("failed"), true);
  for (const s of ["queued", "accepted", "sent", "delivered", "received"]) {
    assert.equal(isFinalFailure(s), false, s);
  }
});

test("send-time errors about the number are recognised; config errors are not", () => {
  for (const code of ["21211", "21610", "21612", "21614"]) assert.ok(RECIPIENT_SEND_ERROR_CODES.has(code), code);
  for (const code of ["20003", "21408", "30007", ""]) assert.ok(!RECIPIENT_SEND_ERROR_CODES.has(code), code);
});

test("timing constants match the plan (15 min no-report, 24 h late window)", () => {
  assert.equal(NO_REPORT_AFTER_MS, 15 * 60 * 1000);
  assert.equal(LATE_REPORT_WINDOW_MS, 24 * 60 * 60 * 1000);
});

test("listing description names the date and the error", () => {
  const text = describeListing({ createdAt: new Date("2026-11-26T10:00:00Z"), errorCode: "30006" });
  assert.match(text, /do-not-text list/);
  assert.match(text, /2026-11-26/);
  assert.match(text, /30006/);
  assert.equal(describeListing(null), "");
});
