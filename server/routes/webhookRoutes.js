import express from "express";
import { handleInboundSMS } from "../controllers/webhookController.js";

const router = express.Router();

// Twilio sends form-urlencoded by default
router.post("/twilio/inbound", handleInboundSMS);

export default router;