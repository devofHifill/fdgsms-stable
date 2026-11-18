import twilio from "twilio";
import { getActiveTwilioConfig } from "../services/twilioService.js";
import { createSystemLog } from "../services/systemLogService.js";

// Rebuild the exact public URL Twilio posted to. Behind Traefik the app sees
// plain http on an internal host, so prefer PUBLIC_BASE_URL, then the
// forwarded headers, then the raw request.
export function buildPublicUrl(req) {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (base) return `${base}${req.originalUrl}`;

  const proto =
    String(req.get("x-forwarded-proto") || req.protocol || "https")
      .split(",")[0]
      .trim();
  const host =
    String(req.get("x-forwarded-host") || req.get("host") || "")
      .split(",")[0]
      .trim();

  return `${proto}://${host}${req.originalUrl}`;
}

function validationEnabled() {
  return String(process.env.TWILIO_WEBHOOK_VALIDATE ?? "true").toLowerCase() !== "false";
}

// Rejects webhook requests that are not signed by Twilio with our auth token.
export async function verifyTwilioSignature(req, res, next) {
  if (!validationEnabled()) return next();

  const signature = req.get("x-twilio-signature");
  const url = buildPublicUrl(req);

  let authToken = "";
  try {
    ({ authToken } = await getActiveTwilioConfig());
  } catch (error) {
    console.error("Twilio signature check: failed to load config:", error);
  }

  const valid =
    Boolean(signature) &&
    Boolean(authToken) &&
    twilio.validateRequest(authToken, signature, url, req.body || {});

  if (valid) return next();

  await createSystemLog({
    level: "warn",
    category: "webhook",
    event: "twilio_signature_invalid",
    message: !authToken
      ? "Rejected webhook: Twilio auth token is not configured"
      : !signature
        ? "Rejected webhook: missing X-Twilio-Signature header"
        : "Rejected webhook: invalid Twilio signature",
    metadata: { url, ip: req.ip, hasSignature: Boolean(signature) },
  });

  return res.status(403).type("text/plain").send("Forbidden");
}
