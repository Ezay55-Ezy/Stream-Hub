import { Router } from "express";
import { db } from "@workspace/db";
import { seriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { telegramClient } from "../telegram-client.js";

const router = Router();

/**
 * GET /api/download/:id
 *
 * Streams a video file from Telegram Saved Messages to the client.
 * Supports HTTP Range requests (RFC 7233) so Expo's createDownloadResumable
 * can pause and resume downloads without restarting from byte zero.
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid series ID" });
      return;
    }

    const rows = await db
      .select({ telegramMessageId: seriesTable.telegramMessageId })
      .from(seriesTable)
      .where(eq(seriesTable.id, id))
      .limit(1);

    if (!rows.length || !rows[0].telegramMessageId) {
      res.status(404).json({ error: "Series not found or has no Telegram message ID" });
      return;
    }

    const rangeHeader = req.headers["range"];

    await telegramClient.streamFileTo(
      rows[0].telegramMessageId,
      typeof rangeHeader === "string" ? rangeHeader : undefined,
      res
    );
  } catch (err) {
    req.log.error({ err }, "Download request failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Download failed" });
    } else {
      res.end();
    }
  }
});

export default router;
