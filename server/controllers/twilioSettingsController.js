import TwilioSettings from "../models/TwilioSettings.js";

// The auth token is never returned to the client in full. We expose only a
// masked hint (whether it is set + the last 4 chars) so the UI can show status.
function maskToken(token) {
  if (!token) return "";
  const last4 = token.slice(-4);
  return `••••••••${last4}`;
}

function serialize(item) {
  return {
    accountSid: item?.accountSid || "",
    phoneNumber: item?.phoneNumber || "",
    messagingServiceSid: item?.messagingServiceSid || "",
    authTokenSet: Boolean(item?.authToken),
    authTokenMasked: maskToken(item?.authToken),
    updatedAt: item?.updatedAt,
  };
}

export async function getTwilioSettings(req, res) {
  try {
    let item = await TwilioSettings.findOne({ key: "default" });

    if (!item) {
      item = await TwilioSettings.create({ key: "default" });
    }

    return res.status(200).json(serialize(item));
  } catch (error) {
    console.error("getTwilioSettings error:", error);
    return res.status(500).json({
      message: "Failed to fetch Twilio settings",
    });
  }
}

export async function updateTwilioSettings(req, res) {
  try {
    const { accountSid, authToken, phoneNumber, messagingServiceSid } =
      req.body;

    let item = await TwilioSettings.findOne({ key: "default" });

    if (!item) {
      item = new TwilioSettings({ key: "default" });
    }

    if (accountSid !== undefined) {
      item.accountSid = String(accountSid).trim();
    }

    // Only overwrite the stored auth token when a new, non-empty value is sent.
    // A blank field means "keep the existing token" (the GET never exposes it).
    if (typeof authToken === "string" && authToken.trim()) {
      item.authToken = authToken.trim();
    }

    if (phoneNumber !== undefined) {
      item.phoneNumber = String(phoneNumber).trim();
    }

    if (messagingServiceSid !== undefined) {
      item.messagingServiceSid = String(messagingServiceSid).trim();
    }

    await item.save();

    return res.status(200).json({
      message: "Twilio settings updated successfully",
      item: serialize(item),
    });
  } catch (error) {
    console.error("updateTwilioSettings error:", error);
    return res.status(500).json({
      message: "Failed to update Twilio settings",
    });
  }
}
