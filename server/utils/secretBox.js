// secretBox.js → symmetric encryption for secrets stored in the DB (the AI
// provider API key). AES-256-GCM with a key derived from an env secret.
//
// Values are stored as "enc:v1:<iv>:<tag>:<ciphertext>" (base64). decryptSecret
// passes through anything without that prefix, so plaintext keys set before
// encryption existed (or by hand) keep working.
//
// The derivation secret comes from AI_SECRET_KEY, else JWT_SECRET. In dev a
// fallback is used so the app still boots; set AI_SECRET_KEY in production.

import crypto from "crypto";

const PREFIX = "enc:v1:";
const SALT = "fdgsms-ai-secretbox-v1";

function getKey() {
  const secret =
    process.env.AI_SECRET_KEY ||
    process.env.JWT_SECRET ||
    "fdgsms-insecure-dev-fallback";
  return crypto.scryptSync(secret, SALT, 32);
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain) {
  const text = plain == null ? "" : String(plain);
  if (!text) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    PREFIX +
    [iv, tag, ciphertext].map((b) => b.toString("base64")).join(":")
  );
}

export function decryptSecret(value) {
  if (!isEncrypted(value)) {
    // Plaintext / backward-compatible — return as-is.
    return value == null ? "" : String(value);
  }

  try {
    const parts = value.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return "";

    const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    return "";
  }
}

// Render a secret for display: never returns the full value, just a masked
// hint of the last 4 characters (e.g. "••••••••wxyz").
export function maskSecret(value) {
  const raw = isEncrypted(value) ? decryptSecret(value) : value == null ? "" : String(value);
  if (!raw) return "";
  return `••••••••${raw.slice(-4)}`;
}
