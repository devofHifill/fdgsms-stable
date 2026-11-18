// Run with: node --test tests/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import twilio from "twilio";

// No DB in tests: fail Mongo calls fast so config falls back to env.
mongoose.set("bufferCommands", false);
process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
process.env.PUBLIC_BASE_URL = "https://sms.example.test";

const { verifyTwilioSignature } = await import("../middleware/twilioSignature.js");

let server;
let port;

before(async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.post("/api/webhooks/twilio/inbound", verifyTwilioSignature, (req, res) =>
    res.status(200).send("ok")
  );
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  port = server.address().port;
});

after(() => server.close());

const params = { From: "+15551234567", To: "+15557654321", Body: "Hello" };
const publicUrl = "https://sms.example.test/api/webhooks/twilio/inbound";

function post(headers = {}) {
  return fetch(`http://127.0.0.1:${port}/api/webhooks/twilio/inbound`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(params).toString(),
  });
}

test("rejects a request with no signature", async () => {
  delete process.env.TWILIO_WEBHOOK_VALIDATE;
  assert.equal((await post()).status, 403);
});

test("rejects a request with a wrong signature", async () => {
  assert.equal((await post({ "x-twilio-signature": "bogus" })).status, 403);
});

test("accepts a correctly signed request", async () => {
  const sig = twilio.getExpectedTwilioSignature("test-auth-token", publicUrl, params);
  assert.equal((await post({ "x-twilio-signature": sig })).status, 200);
});

test("rejects a signature made for a different URL", async () => {
  const sig = twilio.getExpectedTwilioSignature(
    "test-auth-token",
    "https://evil.example.test/api/webhooks/twilio/inbound",
    params
  );
  assert.equal((await post({ "x-twilio-signature": sig })).status, 403);
});

test("TWILIO_WEBHOOK_VALIDATE=false skips the check", async () => {
  process.env.TWILIO_WEBHOOK_VALIDATE = "false";
  try {
    assert.equal((await post()).status, 200);
  } finally {
    delete process.env.TWILIO_WEBHOOK_VALIDATE;
  }
});
