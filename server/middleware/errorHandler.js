// errorHandler.js → last Express middleware: every unhandled error becomes
// JSON { message } (the client shows `message`). Without it Express sends an
// HTML error page and the UI can only say "Request failed".
import multer from "multer";

const MAX_UPLOAD_MB = 10;

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `File is too large. The limit is ${MAX_UPLOAD_MB} MB.`,
  LIMIT_FILE_COUNT: "Upload one file at a time.",
  LIMIT_UNEXPECTED_FILE: "Unexpected file field. Upload the file as \"file\".",
};

export function toErrorResponse(err) {
  if (err instanceof multer.MulterError) {
    return { status: 400, message: MULTER_MESSAGES[err.code] || err.message || "Upload failed" };
  }

  // express.json / urlencoded (body-parser)
  if (err?.type === "entity.parse.failed") {
    return { status: 400, message: "Request body is not valid JSON." };
  }
  if (err?.type === "entity.too.large") {
    return { status: 413, message: "Request is too large." };
  }

  // Errors we raise on purpose carry a 4xx status (e.g. the upload file-type
  // filter, the CORS check) and a message meant for the user.
  const status = Number(err?.statusCode || err?.status);
  if (status >= 400 && status < 500) {
    return { status, message: err.message || "Request failed" };
  }

  // Anything else is a bug: don't leak internals to the client.
  return { status: 500, message: "Something went wrong on the server." };
}

// eslint-disable-next-line no-unused-vars -- Express needs the 4-argument form
export function errorHandler(err, req, res, next) {
  const { status, message } = toErrorResponse(err);
  if (status >= 500) {
    console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  }
  if (res.headersSent) return;
  res.status(status).json({ message });
}
