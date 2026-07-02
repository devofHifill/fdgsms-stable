import express from "express";
import {
  handleInboundSMS,
  handleStatusCallback,
} from "../controllers/webhookController.js";

const router = express.Router();

// Twilio sends form-urlencoded by default
router.post("/twilio/inbound", handleInboundSMS);

// Twilio delivery-status callback (configure as statusCallback URL).
router.post("/twilio/status", handleStatusCallback);

export default router;