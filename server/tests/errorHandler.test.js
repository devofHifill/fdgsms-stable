// Run with: node --test "tests/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import multer from "multer";
import { toErrorResponse } from "../middleware/errorHandler.js";

test("an oversized upload becomes a 400 with the size limit", () => {
  const r = toErrorResponse(new multer.MulterError("LIMIT_FILE_SIZE", "file"));
  assert.equal(r.status, 400);
  assert.match(r.message, /10 MB/);
});

test("a rejected file type keeps its own message", () => {
  const err = new Error("Only CSV, XLSX, and XLS files are allowed.");
  err.statusCode = 400;
  assert.deepEqual(toErrorResponse(err), { status: 400, message: err.message });
});

test("broken JSON and too-large bodies get readable messages", () => {
  assert.equal(toErrorResponse({ type: "entity.parse.failed", status: 400 }).status, 400);
  assert.equal(toErrorResponse({ type: "entity.too.large", status: 413 }).status, 413);
});

test("unexpected errors are a 500 that hides the internal message", () => {
  const r = toErrorResponse(new Error("Cannot read properties of undefined (reading 'x')"));
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.message, /undefined/);
});
