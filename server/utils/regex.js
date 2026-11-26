// Escape user text so it matches literally inside a RegExp / Mongo $regex.
// Without this, a search like "(" or "a+" is a broken or unintended pattern.
export function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
