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

test("REVOKE and spaced forms like STOP ALL / OPT OUT are opt-outs", () => {
  for (const body of ["REVOKE", "revoke!", "STOP ALL", "stop  all", "Stopall", "opt out", "OPT OUT"]) {
    assert.equal(classifyInboundKeyword(body), "stop", body);
  }
});

test('"opt in" with a space is an opt-in keyword', () => {
  assert.equal(classifyInboundKeyword("Opt in"), "start");
});

test("phrases that only contain a keyword are not opt-outs", () => {
  for (const body of ["stop by later", "please don't stop", "the end", "cancel my 3pm?", "quit it lol"]) {
    assert.equal(classifyInboundKeyword(body), "none", body);
  }
});

test("blank messages are not keywords", () => {
  assert.equal(classifyInboundKeyword("   "), "none");
  assert.equal(classifyInboundKeyword(undefined), "none");
});
