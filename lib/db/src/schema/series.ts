import { pgTable, text, serial, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true, createdAt: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;

export const seriesTable = pgTable("series", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  posterUrl: text("poster_url").notNull(),
  downloadUrl: text("download_url").notNull(),
  telegramFileId: text("telegram_file_id").notNull().unique(),
  telegramMessageId: integer("telegram_message_id"),
  fileSize: bigint("file_size", { mode: "number" }),
  duration: integer("duration"),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const configTable = pgTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const insertSeriesSchema = createInsertSchema(seriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSeries = z.infer<typeof insertSeriesSchema>;
export type Series = typeof seriesTable.$inferSelect;
