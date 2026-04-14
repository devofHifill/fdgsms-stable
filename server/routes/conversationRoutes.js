import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getConversations,
  getConversationMessages,
} from "../controllers/conversationController.js";

const router = express.Router();

router.get("/", requireAuth, getConversations);
router.get("/:contactId/messages", requireAuth, getConversationMessages);

export default router;