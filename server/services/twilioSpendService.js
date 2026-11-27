// twilioSpendService.js → campaign plan C7: Twilio spend on the Dashboard.
//
// Whole-account spend today and this month from Twilio's usage records:
// texts, lookups (line-type checks), number rental, and everything else.
// It includes anything else that uses the same Twilio account. Twilio's day
// and month run on UTC, and usage can lag by a few minutes.
import { getTwilioClient } from "./twilioService.js";

export const SPEND_CACHE_MS = 5 * 60 * 1000;
export const SPEND_MIN_REFRESH_MS = 30 * 1000;

// Twilio usage categories (rollups) shown as their own line.
export const SPEND_LINES = [
  { key: "sms", label: "Texts (sent and received)", categories: ["sms"] },
  { key: "lookups", label: "Lookups (line-type checks)", categories: ["lookups"] },
  { key: "numbers", label: "Number rental", categories: ["phonenumbers"] },
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n) => Math.round(n * 1e4) / 1e4;

// Usage records for one period → { total, unit, lines: [...], other }.
export function summarizeUsage(records = []) {
  const byCategory = new Map(records.map((r) => [String(r.category || ""), r]));
  const unit = String(records.find((r) => r.priceUnit)?.priceUnit || "usd").toUpperCase();

  const lines = SPEND_LINES.map((line) => {
    let price = 0;
    let count = 0;
    for (const c of line.categories) {
      const r = byCategory.get(c);
      if (!r) continue;
      price += num(r.price);
      count += num(r.count);
    }
    return { key: line.key, label: line.label, count, price: round(price) };
  });

  const known = lines.reduce((s, l) => s + l.price, 0);
  const totalRecord = byCategory.get("totalprice");
  // Without a "totalprice" record, the total is the sum of the lines.
  const total = totalRecord ? num(totalRecord.price) : known;
  const other = Math.max(round(total - known), 0);

  const r0 = records[0];
  return {
    total: round(total),
    unit,
    lines,
    other,
    startDate: r0?.startDate ? new Date(r0.startDate).toISOString().slice(0, 10) : null,
    endDate: r0?.endDate ? new Date(r0.endDate).toISOString().slice(0, 10) : null,
  };
}

async function defaultFetchUsage(period) {
  const client = await getTwilioClient();
  const list = period === "today" ? client.usage.records.today : client.usage.records.thisMonth;
  return list.list({ pageSize: 1000, limit: 1000 });
}

let cache = null; // { at, value }

export function clearSpendCache() {
  cache = null;
}

// → { ok: true, today, thisMonth, fetchedAt, cached } or { ok: false, reason, message }.
export async function getTwilioSpend({ now = new Date(), refresh = false, fetchUsage = defaultFetchUsage } = {}) {
  const age = cache ? now.getTime() - cache.at : Infinity;
  if (cache && (age < (refresh ? SPEND_MIN_REFRESH_MS : SPEND_CACHE_MS))) {
    return { ...cache.value, cached: true };
  }

  let today;
  let month;
  try {
    [today, month] = await Promise.all([fetchUsage("today"), fetchUsage("thisMonth")]);
  } catch (error) {
    const notConfigured = /not configured/i.test(error?.message || "");
    return {
      ok: false,
      reason: notConfigured ? "twilio_not_configured" : "twilio_error",
      message: notConfigured
        ? "Twilio isn't set up yet (Settings → Twilio)."
        : `Couldn't read usage from Twilio${error?.code ? ` (error ${error.code})` : ""}. Try again in a minute.`,
    };
  }

  const value = {
    ok: true,
    today: summarizeUsage(today),
    thisMonth: summarizeUsage(month),
    fetchedAt: now.toISOString(),
  };
  cache = { at: now.getTime(), value };
  return { ...value, cached: false };
}
