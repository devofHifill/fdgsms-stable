import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getTwilioSettings,
  updateTwilioSettings,
} from "../controllers/twilioSettingsController.js";

const router = express.Router();

router.get("/", requireAuth, getTwilioSettings);
router.put("/", requireAuth, updateTwilioSettings);

export default router;
