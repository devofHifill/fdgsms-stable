// import express from "express";
// import upload from "../middleware/uploadMiddleware.js";
// import { requireAuth } from "../middleware/authMiddleware.js";
// import {
//   uploadPreview,
//   importContacts,
// } from "../controllers/contactImportController.js";

// const router = express.Router();

// router.post("/upload-preview", requireAuth, upload.single("file"), uploadPreview);
// router.post("/import", requireAuth, importContacts);

// export default router;


import express from "express";
import upload from "../middleware/uploadMiddleware.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  uploadPreview,
  importContacts,
} from "../controllers/contactImportController.js";

const router = express.Router();

router.post("/upload-preview", requireAuth, upload.single("file"), uploadPreview);
router.post("/import", requireAuth, importContacts);

export default router;
