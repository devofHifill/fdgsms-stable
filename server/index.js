import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";

import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import contactImportRoutes from "./routes/contactImportRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import automationSettingsRoutes from "./routes/automationSettingsRoutes.js";
import twilioSettingsRoutes from "./routes/twilioSettingsRoutes.js";
import systemLogRoutes from "./routes/systemLogRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";

import { runAutomationCycle } from "./jobs/automationWorker.js";
import { runAiReplyCycle } from "./jobs/aiReplyWorker.js";
import { encryptStoredTwilioToken } from "./services/twilioService.js";
import Campaign from "./models/Campaign.js";
import { DEFAULT_CAMPAIGN_GAP } from "./utils/campaignGap.js";
import { errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();
// One proxy hop (Traefik) sits in front in production, so req.ip is the real
// client from X-Forwarded-For — the login attempt limit keys on it.
app.set("trust proxy", 1);
const PORT = process.env.PORT || 4000;
// Campaign plan C2: campaigns pace themselves with their own gap (≥ 5 s), so
// the worker checks every 5 s instead of sending a batch once a minute.
const AUTOMATION_INTERVAL_MS = 5000;
// Shorter than automation so replies feel timely; the interval also doubles as
// the human-takeover race buffer before the AI answers.
const AI_REPLY_INTERVAL_MS = 20000;

// Local dev origins + this server's own site (CLIENT_URL, https://APP_DOMAIN
// in docker-compose).
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const err = new Error(`CORS blocked for origin: ${origin}`);
      err.statusCode = 403;
      return callback(err);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({ message: "Welcome to FDGSMS backend" });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/protected", protectedRoutes);
app.use("/api/contact-import", contactImportRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/settings", automationSettingsRoutes);
app.use("/api/twilio-settings", twilioSettingsRoutes);
app.use("/api/logs", systemLogRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/ai", aiRoutes);

// Must stay last: turns upload, body-parser, CORS and unexpected errors into
// JSON { message } the client can show.
app.use(errorHandler);

async function startServer() {
  await connectDB();

  // Never block startup on this: a failure only means the token stays as-is.
  await encryptStoredTwilioToken().catch((error) => {
    console.error("Could not encrypt the stored Twilio auth token:", error);
  });

  // Campaign plan C2 (Q17): campaigns from before the gap existed start with
  // a 30-second gap. Runs once per campaign; never overwrites a set gap.
  await Campaign.updateMany(
    { "gap.value": { $exists: false } },
    { $set: { gap: DEFAULT_CAMPAIGN_GAP } }
  )
    .then((r) => {
      if (r.modifiedCount) console.log(`Gave ${r.modifiedCount} campaign(s) the default 30-second gap.`);
    })
    .catch((error) => console.error("Could not set default campaign gaps:", error));

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Allowed CORS origins:", allowedOrigins);
  });

  setInterval(() => {
    runAutomationCycle().catch((error) => {
      console.error("Automation interval error:", error);
    });
  }, AUTOMATION_INTERVAL_MS);

  setInterval(() => {
    runAiReplyCycle().catch((error) => {
      console.error("AI reply interval error:", error);
    });
  }, AI_REPLY_INTERVAL_MS);

  return server;
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});