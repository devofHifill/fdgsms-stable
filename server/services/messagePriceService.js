// messagePriceService.js → campaign plan C6: cost per campaign.
//
// Twilio sets a message's price a short while after it is sent (often after
// the delivery report), and the status callback doesn't carry it. So every
// sweep this looks up the price of a few finished campaign texts and stores
// it on the message. A message is tried a few times, then left unpriced.
import SMSMessage from "../models/SMSMessage.js";
import { getTwilioClient } from "./twilioService.js";

export const PRICE_BATCH = 20;
export const PRICE_MAX_ATTEMPTS = 5;
// Wait after sending before the first lookup, and between retries.
export const PRICE_FIRST_AFTER_MS = 2 * 60 * 1000;
export const PRICE_RETRY_AFTER_MS = 10 * 60 * 1000;

const FINAL_STATUSES = ["delivered", "undelivered", "failed", "sent"];

// Twilio's price is a string like "-0.00830" (negative = charge), or null.
export function parseTwilioPrice(price) {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

export function priceQuery(now = new Date()) {
  return {
    direction: "outbound",
    campaignId: { $ne: null },
    providerMessageSid: { $type: "string", $gt: "" },
    status: { $in: FINAL_STATUSES },
    price: null,
    // $not also matches texts sent before C6, which have no attempts field
    // ($lt alone never matches a missing field).
    priceFetchAttempts: { $not: { $gte: PRICE_MAX_ATTEMPTS } },
    createdAt: { $lte: new Date(now.getTime() - PRICE_FIRST_AFTER_MS) },
    $or: [
      { priceCheckedAt: null },
      { priceCheckedAt: { $lte: new Date(now.getTime() - PRICE_RETRY_AFTER_MS) } },
    ],
  };
}

// `fetchMessage(sid)` is injectable for tests; default asks Twilio.
export async function backfillMessagePrices(now = new Date(), { fetchMessage } = {}) {
  const messages = await SMSMessage.find(priceQuery(now))
    .sort({ createdAt: 1 })
    .limit(PRICE_BATCH)
    .select("_id providerMessageSid")
    .lean();
  if (!messages.length) return { checked: 0, priced: 0 };

  let fetcher = fetchMessage;
  if (!fetcher) {
    let client;
    try {
      client = await getTwilioClient();
    } catch {
      return { checked: 0, priced: 0, skipped: "twilio_not_configured" };
    }
    fetcher = (sid) => client.messages(sid).fetch();
  }

  let priced = 0;
  for (const m of messages) {
    let price = null;
    let unit = "";
    try {
      const remote = await fetcher(m.providerMessageSid);
      price = parseTwilioPrice(remote?.price);
      unit = String(remote?.priceUnit || remote?.price_unit || "").toUpperCase();
    } catch {
      // Not found / network: count the attempt and try again later.
    }
    const set = { priceCheckedAt: now };
    if (price !== null) {
      set.price = price;
      set.priceUnit = unit || "USD";
      priced += 1;
    }
    await SMSMessage.updateOne({ _id: m._id }, { $set: set, $inc: { priceFetchAttempts: 1 } });
  }
  return { checked: messages.length, priced };
}
