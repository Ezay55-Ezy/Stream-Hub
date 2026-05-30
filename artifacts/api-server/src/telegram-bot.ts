/**
 * Telegram Bot — listens to a channel for video files,
 * parses title, fetches a poster (with fallback),
 * and saves to PostgreSQL.
 */
import { Telegraf } from "telegraf";
import { db } from "@workspace/db";
import { seriesTable, categoriesTable, insertSeriesSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";

const BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
const CHANNEL_ID = process.env["TELEGRAM_CHANNEL_ID"];

/** Fetch a poster URL — uses picsum as a stable placeholder keyed by title hash */
function getPosterUrl(title: string): string {
  const hash = [...title].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const seed = Math.abs(hash) % 1000;
  return `https://picsum.photos/seed/${seed}/300/450`;
}

/** Extract a clean title from filename or caption */
function parseTitle(raw: string): string {
  return raw
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[._-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Get or create a category by name */
async function getOrCreateCategory(name: string): Promise<number> {
  const existing = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.name, name))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const inserted = await db
    .insert(categoriesTable)
    .values({ name })
    .returning({ id: categoriesTable.id });

  return inserted[0].id;
}

/** Guess category from title — simple heuristic */
function guessCategoryFromTitle(title: string): string {
  if (/[Ss]\d+[Ee]\d+|season|episode|series/i.test(title)) return "TV Series";
  if (/\bdoc(umentary)?\b/i.test(title)) return "Documentary";
  if (/\banim(e|ated)?\b/i.test(title)) return "Anime";
  return "Movies";
}

async function handleVideo(
  telegram: Telegraf["telegram"],
  video: { file_id: string; file_size?: number; duration?: number; file_name?: string },
  caption: string | undefined,
  messageId: number,
  chatId: string,
): Promise<void> {
  const channelIdStr = CHANNEL_ID!.toString();
  if (chatId !== channelIdStr && `@${chatId}` !== channelIdStr) return;

  const rawTitle = caption || video.file_name || `Video ${messageId}`;
  const title = parseTitle(rawTitle);
  const fileId = video.file_id;

  const fileLink = await telegram.getFileLink(fileId);
  const downloadUrl = fileLink.href;

  const posterUrl = getPosterUrl(title);
  const categoryName = guessCategoryFromTitle(rawTitle);
  const categoryId = await getOrCreateCategory(categoryName);

  const data = insertSeriesSchema.parse({
    title,
    description: caption ?? null,
    posterUrl,
    downloadUrl,
    telegramFileId: fileId,
    telegramMessageId: messageId,
    fileSize: video.file_size ?? null,
    duration: video.duration ?? null,
    categoryId,
  });

  await db
    .insert(seriesTable)
    .values(data)
    .onConflictDoNothing({ target: seriesTable.telegramFileId });

  logger.info({ title, fileId }, "Saved new series from Telegram");
}

export function startBot(): void {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    logger.warn("TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID not set — bot disabled");
    return;
  }

  const bot = new Telegraf(BOT_TOKEN);

  bot.on("message", async (ctx) => {
    try {
      const msg = ctx.message;
      if (!("video" in msg)) return;
      const video = msg.video;
      await handleVideo(
        ctx.telegram,
        video,
        msg.caption,
        msg.message_id,
        msg.chat.id.toString(),
      );
    } catch (err) {
      logger.error({ err }, "Failed to process Telegram message");
    }
  });

  bot.on("channel_post", async (ctx) => {
    try {
      const post = ctx.channelPost;
      if (!("video" in post)) return;
      const video = (post as any).video;
      await handleVideo(
        ctx.telegram,
        video,
        (post as any).caption,
        post.message_id,
        post.chat.id.toString(),
      );
    } catch (err) {
      logger.error({ err }, "Failed to process channel post");
    }
  });

  // Non-blocking launch — errors are logged, server stays up
  bot
    .launch({ dropPendingUpdates: true })
    .then(() => {
      logger.info({ channelId: CHANNEL_ID }, "Telegram bot started");
    })
    .catch((err: unknown) => {
      logger.error({ err }, "Telegram bot launch failed — check BOT_TOKEN validity");
    });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
