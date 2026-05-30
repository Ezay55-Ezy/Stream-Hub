/**
 * TelegramClientManager — singleton gramjs User Client.
 *
 * Non-blocking: initialize() connects and checks auth state but never
 * waits for user input. Auth happens through the /api/auth/* endpoints
 * which the mobile app drives via the login pop-up.
 *
 * Session is persisted to telegram.session in the api-server directory
 * so it survives workflow restarts.
 */
import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, NewMessageEvent } from "telegram/events/index.js";
import { ConnectionTCPFull } from "telegram/network/connection/TCPFull.js";
import { db } from "@workspace/db";
import { seriesTable, categoriesTable, insertSeriesSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";

// ── env ───────────────────────────────────────────────────────────────────────

const API_ID = Number(process.env["TELEGRAM_API_ID"] ?? "0");
const API_HASH = process.env["TELEGRAM_API_HASH"] ?? "";

// Session file lives one level above the compiled dist/ directory,
// i.e. inside artifacts/api-server/ — persists across restarts.
const SESSION_FILE = path.resolve(__dirname, "..", "telegram.session");

// ── DB helpers ────────────────────────────────────────────────────────────────

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

// ── Manager ───────────────────────────────────────────────────────────────────

class TelegramClientManager {
  private client: TelegramClient;
  private authenticated = false;
  private phone: string | null = null;

  constructor() {
    const sessionStr = this.loadSession();
    const session = new StringSession(sessionStr);
    this.client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 3,
      connection: ConnectionTCPFull,
      useWSS: false,
    });
  }

  // ── session persistence ──────────────────────────────────────────────────

  private loadSession(): string {
    try {
      if (existsSync(SESSION_FILE)) {
        const s = readFileSync(SESSION_FILE, "utf8").trim();
        if (s) return s;
      }
    } catch {}
    return process.env["TELEGRAM_SESSION"] ?? "";
  }

  private saveSession(sessionStr: string): void {
    try {
      writeFileSync(SESSION_FILE, sessionStr, "utf8");
      logger.info("Telegram session saved to file");
    } catch (err) {
      logger.error({ err }, "Failed to save Telegram session — add it as TELEGRAM_SESSION secret");
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!API_ID || !API_HASH) {
      logger.warn("TELEGRAM_API_ID or TELEGRAM_API_HASH not set — Telegram client disabled");
      return;
    }

    try {
      await this.client.connect();
      this.authenticated = await this.client.isUserAuthorized();

      if (this.authenticated) {
        logger.info("✅ Telegram session loaded — user is authorized");
        this.startListening();
      } else {
        logger.info("Telegram client connected but not authenticated — open the app to log in");
      }
    } catch (err) {
      logger.error({ err }, "Telegram client failed to connect");
    }
  }

  // ── auth API ─────────────────────────────────────────────────────────────

  getAuthStatus(): { authenticated: boolean; phone: string | null } {
    return { authenticated: this.authenticated, phone: this.phone };
  }

  async sendCode(phone: string): Promise<string> {
    if (!this.client.connected) await this.client.connect();

    const result = await this.client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      })
    );

    this.phone = phone;
    return (result as any).phoneCodeHash as string;
  }

  async verifyCode(phone: string, phoneCodeHash: string, code: string): Promise<string> {
    await this.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code,
      })
    );

    this.authenticated = true;
    this.phone = phone;

    const sessionStr = this.client.session.save() as unknown as string;
    if (sessionStr) this.saveSession(sessionStr);

    logger.info({ phone }, "✅ Telegram authentication successful");
    this.startListening();

    return sessionStr;
  }

  // ── content ingestion ────────────────────────────────────────────────────

  /** Bulk import all video files from Saved Messages ("me"). */
  async syncSavedMessages(): Promise<{ added: number; total: number }> {
    if (!this.authenticated) throw new Error("Not authenticated");

    let added = 0;
    let total = 0;

    try {
      // Iterate messages in Saved Messages (peer = "me")
      for await (const msg of this.client.iterMessages("me", { limit: 500 })) {
        const isVideo = this.isVideoMessage(msg);
        if (!isVideo) continue;
        total++;
        const saved = await this.saveVideoMessage(msg as any);
        if (saved) added++;
      }
    } catch (err) {
      logger.error({ err }, "Error during Saved Messages sync");
    }

    logger.info({ added, total }, "Sync from Saved Messages complete");
    return { added, total };
  }

  private isVideoMessage(msg: any): boolean {
    if (!msg?.media) return false;
    const media = msg.media;
    if (media.className !== "MessageMediaDocument") return false;
    const doc = media.document;
    if (!doc) return false;
    const mime: string = doc.mimeType ?? "";
    if (mime.startsWith("video/")) return true;
    // Also treat files with DocumentAttributeVideo as video
    return (doc.attributes ?? []).some(
      (a: any) => a.className === "DocumentAttributeVideo"
    );
  }

  private async saveVideoMessage(msg: any): Promise<boolean> {
    try {
      const doc = msg.media.document;
      const fileAttr = (doc.attributes ?? []).find(
        (a: any) => a.className === "DocumentAttributeFilename"
      );
      const videoAttr = (doc.attributes ?? []).find(
        (a: any) => a.className === "DocumentAttributeVideo"
      );

      const rawTitle = msg.message || fileAttr?.fileName || `Video_${msg.id}`;
      const title = parseTitle(rawTitle);
      const fileId = String(doc.id);

      // Link to the message in Saved Messages
      const downloadUrl = `https://t.me/me/${msg.id}`;
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

      const result = await db
        .insert(seriesTable)
        .values(data)
        .onConflictDoNothing({ target: seriesTable.telegramFileId })
        .returning({ id: seriesTable.id });

      return result.length > 0;
    } catch (err) {
      logger.error({ err }, "Failed to save video message");
      return false;
    }
  }

  /** Listen for new videos arriving in Saved Messages in real time. */
  startListening(): void {
    this.client.addEventHandler(async (event: NewMessageEvent) => {
      try {
        const msg = event.message as any;
        if (!this.isVideoMessage(msg)) return;
        const saved = await this.saveVideoMessage(msg);
        if (saved) logger.info({ msgId: msg.id }, "New video saved from Saved Messages");
      } catch (err) {
        logger.error({ err }, "Failed to handle new Telegram message");
      }
    }, new NewMessage({}));

    logger.info("Listening for new videos in Saved Messages");
  }
}

// Export singleton
export const telegramClient = new TelegramClientManager();
