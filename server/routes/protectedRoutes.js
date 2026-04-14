import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", requireAuth, (req, res) => {
  res.status(200).json({
    message: "Authorized",
    user: req.user,
  });
});

export default router;