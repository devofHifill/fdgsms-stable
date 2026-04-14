import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getContacts,
  getContactById,
} from "../controllers/contactController.js";

const router = express.Router();

router.get("/", requireAuth, getContacts);
router.get("/:id", requireAuth, getContactById);

export default router;