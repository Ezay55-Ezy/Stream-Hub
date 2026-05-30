import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startUserClient } from "./telegram-bot.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Start Telegram user client (non-fatal — server stays up even if auth fails)
startUserClient().catch((err) => {
  logger.warn({ err }, "Telegram user client failed to start");
});
