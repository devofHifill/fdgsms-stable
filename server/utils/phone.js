

  // Strict US-only MVP rules:
  // 1) 10 digits -> assume US and prepend +1
  // 2) 11 digits starting with 1 -> valid US with country code
  // 3) +1XXXXXXXXXX exactly -> valid
  // Everything else is rejected for now
export function normalizePhone(value) {
  if (value === null || value === undefined) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  const hasPlus = raw.startsWith("+");

  if (!digits) return "";

  if (!hasPlus) {
    if (digits.length === 10) {
      return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }

    return "";
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return "";
}

export function isValidNormalizedPhone(phone) {
  return /^\+1\d{10}$/.test(String(phone || "").trim());
}

export function getPhoneValidationResult(value) {
  const normalizedPhone = normalizePhone(value);

  if (!value || !String(value).trim()) {
    return {
      ok: false,
      normalizedPhone: "",
      reason: "Phone is required",
    };
  }

  if (!normalizedPhone) {
    return {
      ok: false,
      normalizedPhone: "",
      reason:
        "Phone must be a valid US 10-digit number or +1 formatted number",
    };
  }

  if (!isValidNormalizedPhone(normalizedPhone)) {
    return {
      ok: false,
      normalizedPhone,
      reason: "Phone format is invalid",
    };
  }

  return {
    ok: true,
    normalizedPhone,
    reason: "",
  };
}