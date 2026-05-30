/**
 * Telegram User Client (gramjs) — connects as a real Telegram user,
 * monitors a channel for new video messages, and saves them to PostgreSQL.
 *
 * First run: the process will prompt for your phone number and the
 * verification code that Telegram sends you. The session string is then
 * printed to the logs — save it as TELEGRAM_SESSION secret to skip login
 * on subsequent restarts.
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, NewMessageEvent } from "telegram/events/index.js";
import { ConnectionTCPFull } from "telegram/network/connection/TCPFull.js";
import * as readline from "readline";
import { db } from "@workspace/db";
import { seriesTable, categoriesTable, insertSeriesSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";

// ── env ───────────────────────────────────────────────────────────────────────

const API_ID = Number(process.env["TELEGRAM_API_ID"]);
const API_HASH = process.env["TELEGRAM_API_HASH"] ?? "";
const CHANNEL = process.env["TELEGRAM_CHANNEL_USERNAME"] ?? "";
const SESSION_STRING = process.env["TELEGRAM_SESSION"] ?? "";

// ── helpers ───────────────────────────────────────────────────────────────────

function getPosterUrl(title: string): string {
  const hash = [...title].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return `https://picsum.photos/seed/${Math.abs(hash) % 1000}/300/450`;
}

function parseTitle(raw: string): string {
  return raw
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[._-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function guessCategoryFromTitle(title: string): string {
  if (/[Ss]\d+[Ee]\d+|season|episode|series/i.test(title)) return "TV Series";
  if (/\bdoc(umentary)?\b/i.test(title)) return "Documentary";
  if (/\banim(e|ated)?\b/i.test(title)) return "Anime";
  return "Movies";
}

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

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── main export ───────────────────────────────────────────────────────────────

export async function startUserClient(): Promise<void> {
  if (!API_ID || !API_HASH || !CHANNEL) {
    logger.warn(
      "TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_CHANNEL_USERNAME not set — Telegram client disabled"
    );
    return;
  }

  const session = new StringSession(SESSION_STRING);

  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
    // Use pure-TCP connection — avoids the websocket/bufferutil native dependency
    connection: ConnectionTCPFull,
    useWSS: false,
  });

  // Interactive auth — only needed on first run (or when session is missing/expired)
  await client.start({
    phoneNumber: async () => {
      logger.info("📱 Telegram login required — check the terminal/console and enter your phone number");
      return prompt("\n📱 Enter your Telegram phone number (e.g. +1234567890): ");
    },
    password: async () => {
      return prompt("🔒 Enter your 2FA password (press Enter to skip): ");
    },
    phoneCode: async () => {
      return prompt("🔑 Enter the verification code Telegram just sent you: ");
    },
    onError: (err) => {
      logger.error({ err }, "Telegram auth error");
    },
  });

  // Print session string so user can save it as TELEGRAM_SESSION secret
  const savedSession = client.session.save() as unknown as string;
  if (savedSession && savedSession !== SESSION_STRING) {
    logger.info(
      "\n✅ Telegram session active! To skip login on next restart, add this as a secret named TELEGRAM_SESSION:\n\n" +
        savedSession +
        "\n"
    );
  }

  logger.info({ channel: CHANNEL }, "Telegram user client connected — monitoring channel for new videos");

  // Listen for new messages in the configured channel
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const msg = event.message;
      if (!msg.media) return;

      const media = msg.media as any;
      const isVideo =
        media.className === "MessageMediaDocument" &&
        (media.document?.mimeType?.startsWith("video/") ||
          media.document?.mimeType === "application/octet-stream");
      if (!isVideo) return;

      const doc = media.document;
      const fileAttr = doc.attributes?.find(
        (a: any) => a.className === "DocumentAttributeFilename"
      );
      const videoAttr = doc.attributes?.find(
        (a: any) => a.className === "DocumentAttributeVideo"
      );

      const rawTitle = msg.message || fileAttr?.fileName || `Video_${msg.id}`;
      const title = parseTitle(rawTitle);
      const fileId = String(doc.id);

      // Build a resolvable download URL via the Telegram CDN access pattern
      const downloadUrl = `https://t.me/${CHANNEL.replace(/^@/, "")}/${msg.id}`;

      const posterUrl = getPosterUrl(title);
      const categoryName = guessCategoryFromTitle(rawTitle);
      const categoryId = await getOrCreateCategory(categoryName);

      const data = insertSeriesSchema.parse({
        title,
        description: msg.message || null,
        posterUrl,
        downloadUrl,
        telegramFileId: fileId,
        telegramMessageId: msg.id,
        fileSize: Number(doc.size) || null,
        duration: videoAttr?.duration ?? null,
        categoryId,
      });

      await db
        .insert(seriesTable)
        .values(data)
        .onConflictDoNothing({ target: seriesTable.telegramFileId });

      logger.info({ title, fileId }, "Saved new series from Telegram channel");
    } catch (err) {
      logger.error({ err }, "Failed to process Telegram message");
    }
  }, new NewMessage({ chats: [CHANNEL] }));
}
