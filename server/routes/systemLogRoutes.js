import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getSystemLogs } from "../controllers/systemLogController.js";

const router = express.Router();

router.get("/", requireAuth, getSystemLogs);

export default router;