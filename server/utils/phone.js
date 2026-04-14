export function normalizePhone(value) {
  if (!value) return "";

  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (raw.startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }

  return "";
}

export function isValidNormalizedPhone(phone) {
  return /^\+\d{10,15}$/.test(phone);
}