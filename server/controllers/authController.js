// authController.js → login / authentication

// Work: Handles admin login.

    // Usually does:
    // receives email and password
    // checks if credentials are correct
    // creates JWT token
    // sends token + user info back
    // In FDGSMS:

// This is what allows the admin to log into the dashboard securely.

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createAttemptLimiter } from "../utils/attemptLimiter.js";
import { createSystemLog } from "../services/systemLogService.js";

// 10 wrong tries per IP, 50 in total, per 15 minutes.
export const loginLimiter = createAttemptLimiter({
  maxPerKey: 10,
  maxGlobal: 50,
  windowMs: 15 * 60 * 1000,
});

// Constant-time string compare: hashing first gives equal-length buffers, so
// neither the content nor the length of the secret leaks through timing.
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export async function loginAdmin(req, res) {
  try {
    const key = clientKey(req);
    const limit = loginLimiter.check(key);

    if (limit.blocked) {
      const retryAfter = Math.max(Math.ceil(limit.retryAfterMs / 1000), 1);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: `Too many failed login attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      });
    }

    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword || !process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server auth configuration is incomplete",
      });
    }

    // Check both every time (no short-circuit) so timing doesn't reveal
    // whether the email alone was right.
    const emailOk = safeEqual(String(email).trim().toLowerCase(), adminEmail.trim().toLowerCase());
    const passwordOk = safeEqual(password, adminPassword);

    if (!(emailOk && passwordOk)) {
      loginLimiter.recordFailure(key);

      if (loginLimiter.check(key).blocked) {
        await createSystemLog({
          level: "warn",
          category: "auth",
          event: "login_rate_limited",
          message: "Login locked after too many failed attempts",
          metadata: { ip: key },
        });
      }

      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    loginLimiter.recordSuccess(key);

    const token = jwt.sign(
      {
        email: adminEmail,
        role: "admin",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        email: adminEmail,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
