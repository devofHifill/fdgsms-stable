import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
} from "../controllers/templateController.js";

const router = express.Router();

router.get("/", requireAuth, getTemplates);
router.post("/", requireAuth, createTemplate);
router.delete("/:id", requireAuth, deleteTemplate);

export default router;
