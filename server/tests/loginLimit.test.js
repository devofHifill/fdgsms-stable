// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttemptLimiter } from "../utils/attemptLimiter.js";
import { safeEqual } from "../controllers/authController.js";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("blocks a key after maxPerKey failures, other keys unaffected", () => {
  const c = clock();
  const limiter = createAttemptLimiter({ maxPerKey: 3, maxGlobal: 100, windowMs: 1000, now: c.now });

  for (let i = 0; i < 3; i++) {
    assert.equal(limiter.check("a").blocked, false);
    limiter.recordFailure("a");
  }
  assert.equal(limiter.check("a").blocked, true);
  assert.ok(limiter.check("a").retryAfterMs > 0);
  assert.equal(limiter.check("b").blocked, false);
});

test("the block lifts when the window ends", () => {
  const c = clock();
  const limiter = createAttemptLimiter({ maxPerKey: 2, maxGlobal: 100, windowMs: 1000, now: c.now });
  limiter.recordFailure("a");
  limiter.recordFailure("a");
  assert.equal(limiter.check("a").blocked, true);
  c.advance(1001);
  assert.equal(limiter.check("a").blocked, false);
});

test("a successful login clears that key's failures", () => {
  const c = clock();
  const limiter = createAttemptLimiter({ maxPerKey: 2, maxGlobal: 100, windowMs: 1000, now: c.now });
  limiter.recordFailure("a");
  limiter.recordSuccess("a");
  limiter.recordFailure("a");
  assert.equal(limiter.check("a").blocked, false);
});

test("the global cap blocks everyone once total failures hit it", () => {
  const c = clock();
  const limiter = createAttemptLimiter({ maxPerKey: 10, maxGlobal: 5, windowMs: 1000, now: c.now });
  for (let i = 0; i < 5; i++) limiter.recordFailure(`ip-${i}`); // rotating IPs
  const result = limiter.check("brand-new-ip");
  assert.equal(result.blocked, true);
  assert.equal(result.scope, "global");
});

test("safeEqual matches only identical strings, any length", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "secreT"), false);
  assert.equal(safeEqual("secret", "secret-but-longer"), false);
  assert.equal(safeEqual("", ""), true);
});
