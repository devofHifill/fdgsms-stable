// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyInboundKeyword, isOptInRequest } from "../utils/optOut.js";

const active = { optedOut: false, status: "active" };
const optedOut = { optedOut: true, status: "opted_out" };

test('"Yes" from an active contact is a normal reply, not an opt-in', () => {
  assert.equal(isOptInRequest(classifyInboundKeyword("Yes"), active), false);
  assert.equal(isOptInRequest(classifyInboundKeyword("yes!"), active), false);
});

test('"START" from an active contact is a normal reply', () => {
  assert.equal(isOptInRequest(classifyInboundKeyword("START"), active), false);
});

test('"START" / "Yes" from an opted-out contact opts them back in', () => {
  assert.equal(isOptInRequest(classifyInboundKeyword("START"), optedOut), true);
  assert.equal(isOptInRequest(classifyInboundKeyword("Yes"), optedOut), true);
});

test("opted-out flag wins even if status has churned to replied", () => {
  const churned = { optedOut: true, status: "replied" };
  assert.equal(isOptInRequest("start", churned), true);
});

test("non-keyword replies are never opt-ins", () => {
  assert.equal(isOptInRequest(classifyInboundKeyword("yes please call me"), optedOut), false);
});

test("STOP is still classified as stop", () => {
  assert.equal(classifyInboundKeyword(" Stop. "), "stop");
});
