import express from "express";
import {
  handleInboundSMS,
  handleStatusCallback,
} from "../controllers/webhookController.js";
import { verifyTwilioSignature } from "../middleware/twilioSignature.js";

const router = express.Router();

// Twilio sends form-urlencoded by default
router.post("/twilio/inbound", verifyTwilioSignature, handleInboundSMS);

// Twilio delivery-status callback (configure as statusCallback URL).
router.post("/twilio/status", verifyTwilioSignature, handleStatusCallback);

export default router;