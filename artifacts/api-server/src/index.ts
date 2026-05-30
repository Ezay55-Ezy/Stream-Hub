import app from "./app.js";
import { logger } from "./lib/logger.js";
import { telegramClient } from "./telegram-client.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Non-blocking — server is up and serving before auth completes
telegramClient.initialize().catch((err) => {
  logger.warn({ err }, "Telegram client init failed — will retry through app login");
});
