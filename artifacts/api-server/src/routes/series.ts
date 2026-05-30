import { Router } from "express";
import { db } from "@workspace/db";
import { seriesTable, categoriesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { telegramClient } from "../telegram-client.js";

const router = Router();

// Shared select shape
function seriesSelect() {
  return {
    id: seriesTable.id,
    title: seriesTable.title,
    description: seriesTable.description,
    posterUrl: seriesTable.posterUrl,
    downloadUrl: seriesTable.downloadUrl,
    telegramFileId: seriesTable.telegramFileId,
    fileSize: seriesTable.fileSize,
    duration: seriesTable.duration,
    categoryId: seriesTable.categoryId,
    categoryName: categoriesTable.name,
    createdAt: seriesTable.createdAt,
  };
}

function toJson(r: { createdAt: Date; [k: string]: unknown }) {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

// GET /api/series
router.get("/", async (req, res) => {
  try {
    const { categoryId, search } = req.query;

    const rows = await db
      .select(seriesSelect())
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .orderBy(desc(seriesTable.createdAt));

    let filtered = rows;
    if (categoryId) {
      filtered = filtered.filter((r) => r.categoryId === Number(categoryId));
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) => r.title.toLowerCase().includes(q));
    }

    res.json(filtered.map(toJson));
  } catch (err) {
    req.log.error({ err }, "Failed to list series");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/series/featured
router.get("/featured", async (req, res) => {
  try {
    const rows = await db
      .select(seriesSelect())
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .orderBy(desc(seriesTable.createdAt))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "No series found" });
      return;
    }
    res.json(toJson(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get featured series");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/series/recent
router.get("/recent", async (req, res) => {
  try {
    const rows = await db
      .select(seriesSelect())
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .orderBy(desc(seriesTable.createdAt))
      .limit(10);

    res.json(rows.map(toJson));
  } catch (err) {
    req.log.error({ err }, "Failed to get recent series");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/series/sync  — bulk import from Saved Messages
router.post("/sync", async (req, res) => {
  try {
    const { authenticated } = telegramClient.getAuthStatus();
    if (!authenticated) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const result = await telegramClient.syncSavedMessages();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Sync failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/series/:id
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const rows = await db
      .select(seriesSelect())
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .where(eq(seriesTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(toJson(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get series by id");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
