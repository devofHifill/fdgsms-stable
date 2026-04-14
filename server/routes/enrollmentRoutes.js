import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  enrollContact,
  bulkEnrollContacts,
  getEnrollments,
  getEnrollmentByContact,
} from "../controllers/enrollmentController.js";

const router = express.Router();

router.post("/", requireAuth, enrollContact);
router.post("/bulk", requireAuth, bulkEnrollContacts);
router.get("/", requireAuth, getEnrollments);
router.get("/contact/:contactId", requireAuth, getEnrollmentByContact);

export default router;