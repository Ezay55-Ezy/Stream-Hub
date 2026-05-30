import { Router } from "express";
import { db } from "@workspace/db";
import { seriesTable, categoriesTable } from "@workspace/db";
import { eq, desc, ilike, or } from "drizzle-orm";

const router = Router();

// GET /api/series
router.get("/", async (req, res) => {
  try {
    const { categoryId, search } = req.query;

    let query = db
      .select({
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
      })
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .orderBy(desc(seriesTable.createdAt));

    const rows = await query;

    let filtered = rows;
    if (categoryId) {
      filtered = filtered.filter((r) => r.categoryId === Number(categoryId));
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) => r.title.toLowerCase().includes(q));
    }

    res.json(
      filtered.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list series");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/series/featured
router.get("/featured", async (req, res) => {
  try {
    const rows = await db
      .select({
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
      })
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .orderBy(desc(seriesTable.createdAt))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "No series found" });
      return;
    }

    const r = rows[0];
    res.json({ ...r, createdAt: r.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get featured series");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/series/recent
router.get("/recent", async (req, res) => {
  try {
    const rows = await db
      .select({
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
      })
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .orderBy(desc(seriesTable.createdAt))
      .limit(10);

    res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to get recent series");
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
      .select({
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
      })
      .from(seriesTable)
      .leftJoin(categoriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .where(eq(seriesTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const r = rows[0];
    res.json({ ...r, createdAt: r.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get series by id");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
