import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, seriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

// GET /api/categories
router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        seriesCount: sql<number>`cast(count(${seriesTable.id}) as integer)`,
      })
      .from(categoriesTable)
      .leftJoin(seriesTable, eq(seriesTable.categoryId, categoriesTable.id))
      .groupBy(categoriesTable.id, categoriesTable.name)
      .orderBy(categoriesTable.name);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
