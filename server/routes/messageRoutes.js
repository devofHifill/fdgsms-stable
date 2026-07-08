import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  sendManualMessage,
  getMessagesByContact,
  retryMessage,
} from "../controllers/messageController.js";

const router = express.Router();

router.post("/send", requireAuth, sendManualMessage);
router.get("/contact/:contactId", requireAuth, getMessagesByContact);
router.post("/:id/retry", requireAuth, retryMessage);

export default router;