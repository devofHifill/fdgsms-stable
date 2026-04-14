// import express from "express";
// import cors from "cors";

// const app = express();

// app.use(express.json());
// app.use(cors(
//   {
//     origin: [
//       "http://localhost:5173/"
//       "http://localhost:5174/"
//       "http://localhost:3000"
//       // ADD PRODUCTION URL
//     ],
//     credentials:true,

//   }
// ));

// app.get("/api/message", (req, res) => {
//   res.json({ message: "hello from FDG" });
// });

// const port = 4000;

// app.listen(port, () => {
//   console.log(`Server is running at http://localhost:${port}`);
// });

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
import { runAutomationCycle } from "./jobs/automationWorker.js";
import automationSettingsRoutes from "./routes/automationSettingsRoutes.js";
import systemLogRoutes from "./routes/systemLogRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://76.13.242.148:5175",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/logs", systemLogRoutes);

async function startServer() {
  await connectDB();

  setInterval(() => {
    runAutomationCycle();
  }, 15000);

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Allowed CORS origins:", allowedOrigins);
  });
}

startServer();