/**
 * TelegramClientManager — singleton gramjs User Client.
 *
 * Non-blocking: initialize() connects and checks auth state but never
 * waits for user input. Auth happens through the /api/auth/* endpoints
 * which the mobile app drives via the login pop-up.
 *
 * Session is persisted to the Neon PostgreSQL database so it survives
 * server restarts and redeploys.
 */
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, NewMessageEvent } from "telegram/events/index.js";
import { ConnectionTCPFull } from "telegram/network/connection/TCPFull.js";
import { computeCheck as computePasswordCheck } from "telegram/Password.js";
import { iterDownload } from "telegram/client/downloads.js";
import bigInt from "big-integer";
import type { Response } from "express";
import { db } from "@workspace/db";
import { seriesTable, categoriesTable, configTable, insertSeriesSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";

// ── env ───────────────────────────────────────────────────────────────────────

const API_ID = Number(process.env["TELEGRAM_API_ID"] ?? "0");
const API_HASH = process.env["TELEGRAM_API_HASH"] ?? "";



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
    this.client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
      connectionRetries: 3,
      connection: ConnectionTCPFull,
      useWSS: false,
    });
  }

  // ── session persistence ──────────────────────────────────────────────────

  private async loadSession(): Promise<string> {
    try {
      const row = await db
        .select({ value: configTable.value })
        .from(configTable)
        .where(eq(configTable.key, "telegram_session"))
        .limit(1);
      if (row.length > 0 && row[0].value) return row[0].value;
    } catch (err) {
      logger.error({ err }, "Failed to load session from DB");
    }
    return process.env["TELEGRAM_SESSION"] ?? "";
  }

  private async saveSession(sessionStr: string): Promise<void> {
    try {
      await db
        .insert(configTable)
        .values({ key: "telegram_session", value: sessionStr })
        .onConflictDoUpdate({ target: configTable.key, set: { value: sessionStr } });
      logger.info("Telegram session saved to database");
    } catch (err) {
      logger.error({ err }, "Failed to save Telegram session to database");
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  private async ensureConfigTable(): Promise<void> {
    try {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      );
    } catch (err) {
      logger.error({ err }, "Failed to ensure config table");
    }
  }

  async initialize(): Promise<void> {
    if (!API_ID || !API_HASH) {
      logger.warn("TELEGRAM_API_ID or TELEGRAM_API_HASH not set — Telegram client disabled");
      return;
    }

    await this.ensureConfigTable();

    try {
      const sessionStr = await this.loadSession();
      if (sessionStr) {
        this.client.session = new StringSession(sessionStr);
      }
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

  async ensureConnected() {
    if (!this.client.connected) {
      await this.client.connect();
    }
  }

  async sendCode(phone: string): Promise<string> {
    await this.ensureConnected();

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
    await this.ensureConnected();
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

  async verifyPassword(password: string): Promise<string> {
    if (!this.phone) throw new Error("No phone number from previous step");
    await this.ensureConnected();

    const passwordInfo = await this.client.invoke(
      new Api.account.GetPassword()
    );

    const { srpId, A, M1 } = await computePasswordCheck(
      passwordInfo,
      password,
    );

    await this.client.invoke(
      new Api.auth.CheckPassword({
        password: new Api.InputCheckPasswordSRP({
          srpId,
          A: Buffer.from(A),
          M1: Buffer.from(M1),
        }),
      })
    );

    this.authenticated = true;
    const sessionStr = this.client.session.save() as unknown as string;
    if (sessionStr) this.saveSession(sessionStr);

    logger.info({ phone: this.phone }, "2FA verification successful");
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

  // ── file streaming ───────────────────────────────────────────────────────

  /**
   * Stream a Telegram Saved Messages video directly to an Express Response.
   * Supports HTTP Range requests (RFC 7233) for pause/resume downloads.
   *
   * @param messageId  - Telegram message ID inside Saved Messages ("me")
   * @param rangeHeader - value of the incoming Range header, e.g. "bytes=52428800-"
   * @param res        - Express Response object (headers must not be sent yet)
   */
  async streamFileTo(
    messageId: number,
    rangeHeader: string | undefined,
    res: Response
  ): Promise<void> {
    if (!this.authenticated) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    await this.ensureConnected();

    // Fetch the message from Saved Messages
    const messages = await this.client.getMessages("me", { ids: [messageId] });
    const msg = messages[0];

    if (!msg?.media || (msg.media as any).className !== "MessageMediaDocument") {
      res.status(404).json({ error: "Media not found in Saved Messages" });
      return;
    }

    const doc = (msg.media as any).document;
    const fileSize = Number(doc.size);
    const mimeType: string = doc.mimeType ?? "video/mp4";
    const filenameAttr = (doc.attributes ?? []).find(
      (a: any) => a.className === "DocumentAttributeFilename"
    );
    const filename = (filenameAttr?.fileName as string | undefined) ?? `video_${messageId}.mp4`;

    // Parse Range header
    let rangeStart = 0;
    let rangeEnd = fileSize - 1;

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        rangeStart = parseInt(m[1], 10);
        rangeEnd = m[2] ? parseInt(m[2], 10) : fileSize - 1;
      }
    }

    const contentLength = rangeEnd - rangeStart + 1;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", contentLength.toString());

    if (rangeHeader) {
      res.setHeader("Content-Range", `bytes ${rangeStart}-${rangeEnd}/${fileSize}`);
      res.status(206);
    } else {
      res.status(200);
    }

    const location = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });

    // Align start offset to the requestSize boundary so Telegram's MTProto
    // always receives a properly-aligned offset. Any excess bytes from the
    // aligned start up to the real rangeStart are discarded from the first chunk.
    const REQUEST_SIZE = 1024 * 1024; // 1 MB
    const alignedStart = Math.floor(rangeStart / REQUEST_SIZE) * REQUEST_SIZE;
    const bytesToSkip = rangeStart - alignedStart;
    let bytesRemaining = contentLength;
    let isFirstChunk = true;

    let aborted = false;
    res.on("close", () => {
      aborted = true;
    });

    try {
      const iter = iterDownload(this.client, {
        file: location,
        offset: bigInt(alignedStart),
        requestSize: REQUEST_SIZE,
        dcId: doc.dcId as number,
      });

      for await (const rawChunk of iter as unknown as AsyncIterable<Buffer>) {
        if (aborted || bytesRemaining <= 0) break;

        let chunk = rawChunk as Buffer;

        // Trim alignment prefix on the first chunk
        if (isFirstChunk && bytesToSkip > 0) {
          chunk = chunk.slice(bytesToSkip);
          isFirstChunk = false;
        }

        // Trim to exact range boundary
        if (chunk.length > bytesRemaining) {
          chunk = chunk.slice(0, bytesRemaining);
        }

        if (chunk.length === 0) continue;

        const ok = res.write(chunk);
        bytesRemaining -= chunk.length;

        // Respect backpressure
        if (!ok) {
          await new Promise<void>((r) => res.once("drain", r));
        }
      }
    } catch (err) {
      if (!aborted) {
        logger.error({ err, messageId }, "Error while streaming file");
      }
    }

    res.end();
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
