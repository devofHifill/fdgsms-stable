import twilio from "twilio";
import TwilioSettings from "../models/TwilioSettings.js";

let cachedClient = null;
let cachedKey = null;

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
    authToken: settings?.authToken || process.env.TWILIO_AUTH_TOKEN || "",
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

export async function sendSMS({ to, body }) {
  const config = await getActiveTwilioConfig();
  const client = clientFromConfig(config);

  if (config.messagingServiceSid) {
    return await client.messages.create({
      messagingServiceSid: config.messagingServiceSid,
      to,
      body,
    });
  }

  if (!config.phoneNumber) {
    throw new Error("Twilio sender phone number is not configured");
  }

  return await client.messages.create({
    from: config.phoneNumber,
    to,
    body,
  });
}