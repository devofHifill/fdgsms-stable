import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getConversations,
  getConversationMessages,
  deleteMessage,
  deleteConversation,
} from "../controllers/conversationController.js";

const router = express.Router();

router.get("/", requireAuth, getConversations);
router.get("/:contactId/messages", requireAuth, getConversationMessages);

// Delete a single message (specific literal route declared before the param route).
router.delete("/messages/:messageId", requireAuth, deleteMessage);

// Delete an entire conversation thread for a contact.
router.delete("/:contactId", requireAuth, deleteConversation);

export default router;