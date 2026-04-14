import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  createCampaign,
  getCampaigns,
} from "../controllers/campaignController.js";

const router = express.Router();

router.post("/", requireAuth, createCampaign);
router.get("/", requireAuth, getCampaigns);

export default router;