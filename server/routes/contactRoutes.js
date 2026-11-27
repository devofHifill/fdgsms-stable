import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getContacts,
  getContactById,
  bulkUpdateTags,
  removeContactFromDoNotText,
} from "../controllers/contactController.js";

const router = express.Router();

router.get("/", requireAuth, getContacts);
// Literal route declared before the param route so it is not shadowed.
router.patch("/bulk-tags", requireAuth, bulkUpdateTags);
router.get("/:id", requireAuth, getContactById);
router.delete("/:id/do-not-text", requireAuth, removeContactFromDoNotText);

export default router;