export function renderTemplate(template = "", variables = {}) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });
}

export function buildContactTemplateVariables(contact = {}) {
  const firstName = String(contact.firstName || "").trim();
  const lastName = String(contact.lastName || "").trim();
  const fullName =
    String(contact.fullName || "").trim() ||
    `${firstName} ${lastName}`.trim();

  return {
    name: fullName,
    fullName,
    firstName,
    lastName,
    email: String(contact.email || "").trim(),
    phone: String(contact.phone || "").trim(),
    normalizedPhone: String(contact.normalizedPhone || "").trim(),
  };
}