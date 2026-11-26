// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import SystemLog from "../models/SystemLog.js";

const log = (category) =>
  new SystemLog({ category, event: "test_event", message: "test" }).validateSync();

test('"ai" logs pass validation (AI worker and AI routes write them)', () => {
  assert.equal(log("ai"), undefined);
});

test("every other category the server writes still passes", () => {
  for (const category of ["sms", "upload", "webhook", "automation", "auth", "api", "system"]) {
    assert.equal(log(category), undefined, category);
  }
});

test("an unknown category is still rejected", () => {
  assert.ok(log("nope")?.errors?.category);
});
