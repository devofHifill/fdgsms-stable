import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getAutomationSettings,
  updateAutomationSettings,
} from "../controllers/automationSettingsController.js";

const router = express.Router();

router.get("/", requireAuth, getAutomationSettings);
router.put("/", requireAuth, updateAutomationSettings);

export default router;