// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeRegex } from "../utils/regex.js";

test("special characters match literally", () => {
  for (const text of ["(", "a+b", "[x]", "price $5.00?", "c:\\path", "a|b", "^start", "end$"]) {
    const re = new RegExp(escapeRegex(text), "i");
    assert.ok(re.test(`before ${text} after`), text);
  }
});

test('"a+b" no longer matches "aab"', () => {
  assert.equal(new RegExp(escapeRegex("a+b")).test("aab"), false);
});

test("plain text is unchanged", () => {
  assert.equal(escapeRegex("upload_preview"), "upload_preview");
});
