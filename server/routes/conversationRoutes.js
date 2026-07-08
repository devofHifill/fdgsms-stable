import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getConversations,
  getConversationMessages,
  getUnreadCount,
  markConversationRead,
  deleteMessage,
  deleteConversation,
} from "../controllers/conversationController.js";

const router = express.Router();

router.get("/", requireAuth, getConversations);
// Literal route declared before the param route so it is not shadowed.
router.get("/unread-count", requireAuth, getUnreadCount);
router.get("/:contactId/messages", requireAuth, getConversationMessages);

// Mark a conversation as read.
router.post("/:contactId/read", requireAuth, markConversationRead);

// Delete a single message (specific literal route declared before the param route).
router.delete("/messages/:messageId", requireAuth, deleteMessage);

// Delete an entire conversation thread for a contact.
router.delete("/:contactId", requireAuth, deleteConversation);

export default router;