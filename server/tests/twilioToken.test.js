// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, isEncrypted, maskSecret } from "../utils/secretBox.js";
import { readStoredAuthToken } from "../services/twilioService.js";

const TOKEN = "0123456789abcdef0123456789abcdef";

test("an encrypted token reads back as the original", () => {
  const stored = encryptSecret(TOKEN);
  assert.ok(isEncrypted(stored));
  assert.ok(!stored.includes(TOKEN));
  assert.equal(readStoredAuthToken(stored), TOKEN);
});

test("a plaintext token from before encryption still works", () => {
  assert.equal(readStoredAuthToken(TOKEN), TOKEN);
});

test("empty or missing token reads as empty", () => {
  assert.equal(readStoredAuthToken(""), "");
  assert.equal(readStoredAuthToken(undefined), "");
});

test("a token encrypted with a different secret reads as empty", () => {
  const saved = process.env.AI_SECRET_KEY;
  process.env.AI_SECRET_KEY = "secret-one";
  const stored = encryptSecret(TOKEN);
  process.env.AI_SECRET_KEY = "secret-two";
  try {
    assert.equal(readStoredAuthToken(stored), "");
  } finally {
    if (saved === undefined) delete process.env.AI_SECRET_KEY;
    else process.env.AI_SECRET_KEY = saved;
  }
});

test("the masked hint shows only the last 4 characters", () => {
  assert.equal(maskSecret(encryptSecret(TOKEN)), "••••••••cdef");
});
