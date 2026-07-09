import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getSettings, updateSettings } from "../controllers/aiSettingsController.js";
import {
  setContactAiMode,
  claimTakeover,
  releaseTakeover,
  listDrafts,
  approveDraft,
  rejectDraft,
} from "../controllers/aiController.js";

const router = express.Router();

// AI settings
router.get("/settings", requireAuth, getSettings);
router.put("/settings", requireAuth, updateSettings);

// Per-contact AI mode (layer 2)
router.patch("/contacts/:contactId/ai-mode", requireAuth, setContactAiMode);

// Human takeover (layer 3)
router.post("/conversations/:contactId/takeover", requireAuth, claimTakeover);
router.post("/conversations/:contactId/release", requireAuth, releaseTakeover);

// Draft inbox
router.get("/drafts", requireAuth, listDrafts);
router.post("/drafts/:jobId/approve", requireAuth, approveDraft);
router.post("/drafts/:jobId/reject", requireAuth, rejectDraft);

export default router;
