import twilio from "twilio";
import TwilioSettings from "../models/TwilioSettings.js";
import { decryptSecret, encryptSecret, isEncrypted } from "../utils/secretBox.js";

let cachedClient = null;
let cachedKey = null;

// The auth token is stored encrypted (enc:v1:…). Plaintext from before
// encryption still reads as-is. A value that no longer decrypts means the
// AI_SECRET_KEY / JWT_SECRET it was encrypted with has changed.
export function readStoredAuthToken(stored) {
  if (!stored) return "";
  const token = decryptSecret(stored);
  if (!token && isEncrypted(stored)) {
    console.error(
      "Twilio auth token in the DB could not be decrypted (AI_SECRET_KEY/JWT_SECRET changed?). " +
        "Re-enter it on the Twilio settings page."
    );
  }
  return token;
}

// One-off upgrade: encrypt an auth token that was saved before encryption
// existed. Safe to run on every start; does nothing once it is encrypted.
export async function encryptStoredTwilioToken() {
  const item = await TwilioSettings.findOne({ key: "default" });
  if (!item?.authToken || isEncrypted(item.authToken)) return false;

  item.authToken = encryptSecret(item.authToken);
  await item.save();
  console.log("Encrypted the stored Twilio auth token.");
  return true;
}

// Resolve the active Twilio config. DB-stored settings (managed from the
// Settings page) take precedence over the TWILIO_* environment variables.
export async function getActiveTwilioConfig() {
  let settings = null;

  try {
    settings = await TwilioSettings.findOne({ key: "default" }).lean();
  } catch (error) {
    console.error("Failed to load Twilio settings, falling back to env:", error);
  }

  return {
    accountSid: settings?.accountSid || process.env.TWILIO_ACCOUNT_SID || "",
    authToken: readStoredAuthToken(settings?.authToken) || process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: settings?.phoneNumber || process.env.TWILIO_PHONE_NUMBER || "",
    messagingServiceSid:
      settings?.messagingServiceSid ||
      process.env.TWILIO_MESSAGING_SERVICE_SID ||
      "",
  };
}

// Build (or reuse) a Twilio client for the given config. The client is cached
// and automatically rebuilt when the credentials change.
function clientFromConfig(config) {
  if (!config.accountSid || !config.authToken) {
    throw new Error("Twilio credentials are not configured");
  }

  const key = `${config.accountSid}:${config.authToken}`;
  if (cachedClient && cachedKey === key) return cachedClient;

  cachedClient = twilio(config.accountSid, config.authToken);
  cachedKey = key;
  return cachedClient;
}

export async function getTwilioClient() {
  return clientFromConfig(await getActiveTwilioConfig());
}

export async function lookupPhoneNumber(to) {
  if (!to) {
    throw new Error("Phone number is required for lookup");
  }

  const client = await getTwilioClient();

  const result = await client.lookups.v2
    .phoneNumbers(to)
    .fetch({ fields: "line_type_intelligence" });

  const lineType =
    result?.lineTypeIntelligence?.type ||
    result?.line_type_intelligence?.type ||
    "unknown";

  return {
    raw: result,
    lineType,
    isSmsCapable: lineType === "mobile",
  };
}

// Where Twilio reports each message's final status (delivered / undelivered /
// failed + error code). Needs the public https origin, so it is left out
// locally where Twilio couldn't reach us anyway.
export function getStatusCallbackUrl() {
  const base = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return "";
  return `${base}/api/webhooks/twilio/status`;
}

export async function sendSMS({ to, body }) {
  const config = await getActiveTwilioConfig();
  const client = clientFromConfig(config);

  const statusCallback = getStatusCallbackUrl();
  const extra = statusCallback ? { statusCallback } : {};

  if (config.messagingServiceSid) {
    return await client.messages.create({
      messagingServiceSid: config.messagingServiceSid,
      to,
      body,
      ...extra,
    });
  }

  if (!config.phoneNumber) {
    throw new Error("Twilio sender phone number is not configured");
  }

  return await client.messages.create({
    from: config.phoneNumber,
    to,
    body,
    ...extra,
  });
}