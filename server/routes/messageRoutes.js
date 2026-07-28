import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  sendManualMessage,
  getMessagesByContact,
  retryMessage,
  getDeliveryReport,
  unblockDelivery,
} from "../controllers/messageController.js";

const router = express.Router();

router.post("/send", requireAuth, sendManualMessage);
// Literal routes before param routes.
router.get("/delivery-report", requireAuth, getDeliveryReport);
router.patch("/delivery-unblock/:contactId", requireAuth, unblockDelivery);
router.get("/contact/:contactId", requireAuth, getMessagesByContact);
router.post("/:id/retry", requireAuth, retryMessage);

export default router;