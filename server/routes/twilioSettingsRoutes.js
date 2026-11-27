import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getTwilioSettings,
  updateTwilioSettings,
} from "../controllers/twilioSettingsController.js";
import { getTwilioSpend } from "../services/twilioSpendService.js";

const router = express.Router();

router.get("/", requireAuth, getTwilioSettings);
router.put("/", requireAuth, updateTwilioSettings);

// Campaign plan C7: account spend today / this month (cached 5 min;
// ?refresh=1 re-reads Twilio, at most every 30 s).
router.get("/spend", requireAuth, async (req, res) => {
  try {
    const result = await getTwilioSpend({ refresh: req.query.refresh === "1" });
    return res.json(result);
  } catch (error) {
    console.error("getTwilioSpend error:", error);
    return res.status(500).json({ message: "Failed to load Twilio spend" });
  }
});

export default router;
