import { Router } from "express";
import { telegramClient } from "../telegram-client.js";

const router = Router();

// GET /api/auth/status
router.get("/status", (_req, res) => {
  res.json(telegramClient.getAuthStatus());
});

// POST /api/auth/send-code
router.post("/send-code", async (req, res) => {
  try {
    const { phone } = req.body as { phone?: string };
    if (!phone || typeof phone !== "string") {
      res.status(400).json({ error: "phone is required" });
      return;
    }

    const phoneCodeHash = await telegramClient.sendCode(phone.trim());
    res.json({ phoneCodeHash });
  } catch (err: any) {
    req.log.error({ err }, "send-code failed");
    const msg = err?.message ?? "Failed to send code";
    res.status(400).json({ error: msg });
  }
});

// POST /api/auth/verify-code
router.post("/verify-code", async (req, res) => {
  try {
    const { phone, phoneCodeHash, code } = req.body as {
      phone?: string;
      phoneCodeHash?: string;
      code?: string;
    };

    if (!phone || !phoneCodeHash || !code) {
      res.status(400).json({ error: "phone, phoneCodeHash, and code are required" });
      return;
    }

    const session = await telegramClient.verifyCode(
      phone.trim(),
      phoneCodeHash.trim(),
      code.trim()
    );

    res.json({ session });
  } catch (err: any) {
    req.log.error({ err }, "verify-code failed");
    const errorMsg: string = err?.message ?? "Verification failed";

    // Surface 2FA requirement as a distinct error
    if (
      errorMsg.includes("SESSION_PASSWORD_NEEDED") ||
      errorMsg.includes("Two-steps verification")
    ) {
      res.status(400).json({ error: "2FA_REQUIRED" });
      return;
    }

    res.status(400).json({ error: errorMsg });
  }
});

export default router;
