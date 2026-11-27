import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  createCampaign,
  getCampaigns,
  getCampaignStats,
  updateCampaign,
  deleteCampaign,
  cloneCampaign,
  getStopPreview,
  stopCampaignHandler,
} from "../controllers/campaignController.js";

const router = express.Router();

router.post("/", requireAuth, createCampaign);
router.get("/", requireAuth, getCampaigns);
// Literal route before param routes.
router.get("/stats", requireAuth, getCampaignStats);
router.post("/:id/clone", requireAuth, cloneCampaign);
router.get("/:id/stop-preview", requireAuth, getStopPreview);
router.post("/:id/stop", requireAuth, stopCampaignHandler);
router.put("/:id", requireAuth, updateCampaign);
router.delete("/:id", requireAuth, deleteCampaign);

export default router;