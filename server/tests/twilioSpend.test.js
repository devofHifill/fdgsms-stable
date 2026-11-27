// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeUsage, getTwilioSpend, clearSpendCache } from "../services/twilioSpendService.js";

const rec = (category, price, count = "0") => ({
  category, price, count, priceUnit: "usd",
  startDate: new Date("2026-11-01T00:00:00Z"), endDate: new Date("2026-11-27T00:00:00Z"),
});

test("usage records become texts, lookups, number rental and other", () => {
  const s = summarizeUsage([
    rec("totalprice", 12.5),
    rec("sms", 8.3, "1000"),
    rec("sms-outbound", 7.9, "950"), // a detail of "sms", not counted twice
    rec("lookups", 1.2, "120"),
    rec("phonenumbers", 1.15, "1"),
    rec("calls", 0.0),
  ]);
  assert.equal(s.total, 12.5);
  assert.equal(s.unit, "USD");
  assert.deepEqual(s.lines.map((l) => [l.key, l.price, l.count]), [["sms", 8.3, 1000], ["lookups", 1.2, 120], ["numbers", 1.15, 1]]);
  assert.equal(s.other, 1.85);
  assert.equal(s.startDate, "2026-11-01");
});

test("missing categories count as zero; no total record → sum of lines", () => {
  const s = summarizeUsage([rec("sms", 0.0166, "2")]);
  assert.equal(s.total, 0.0166);
  assert.equal(s.other, 0);
  assert.equal(s.lines[1].price, 0);
  assert.equal(summarizeUsage([]).total, 0);
});

test("spend is cached for 5 minutes; refresh re-reads after 30 s", async () => {
  clearSpendCache();
  let calls = 0;
  const fetchUsage = async () => { calls += 1; return [rec("totalprice", 1)]; };
  const t0 = new Date("2026-11-27T15:00:00Z");
  const a = await getTwilioSpend({ now: t0, fetchUsage });
  assert.equal(a.ok, true); assert.equal(a.cached, false); assert.equal(calls, 2); // today + this month
  const b = await getTwilioSpend({ now: new Date(t0.getTime() + 60e3), fetchUsage });
  assert.equal(b.cached, true); assert.equal(calls, 2);
  const c = await getTwilioSpend({ now: new Date(t0.getTime() + 10e3), refresh: true, fetchUsage });
  assert.equal(c.cached, true, "refresh within 30 s uses the cache");
  const d = await getTwilioSpend({ now: new Date(t0.getTime() + 45e3), refresh: true, fetchUsage });
  assert.equal(d.cached, false); assert.equal(calls, 4);
  const e = await getTwilioSpend({ now: new Date(t0.getTime() + 6 * 60e3), fetchUsage });
  assert.equal(e.cached, false);
});

test("Twilio not set up or failing → a clear message, nothing cached", async () => {
  clearSpendCache();
  const a = await getTwilioSpend({ fetchUsage: async () => { throw new Error("Twilio credentials are not configured"); } });
  assert.deepEqual([a.ok, a.reason], [false, "twilio_not_configured"]);
  const b = await getTwilioSpend({ fetchUsage: async () => { const e = new Error("Authenticate"); e.code = 20003; throw e; } });
  assert.deepEqual([b.ok, b.reason], [false, "twilio_error"]);
  assert.match(b.message, /20003/);
  let calls = 0;
  await getTwilioSpend({ fetchUsage: async () => { calls += 1; return []; } });
  assert.equal(calls, 2, "a failure isn't cached");
});
