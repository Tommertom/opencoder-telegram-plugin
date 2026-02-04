import type { Plugin } from "@opencode-ai/plugin";
import { createTelegramBot } from "./bot.js";
import { type Config, loadConfig } from "./config.js";
import {
  type EventHandlerContext,
  handleQuestionAsked,
  handleSessionStatus,
  handleSessionUpdated,
} from "./events/index.js";

import { SessionTitleService } from "./services/session-title-service.js";

export const TelegramRemote: Plugin = async ({ client }) => {
  console.log("[TelegramRemote] Plugin initialization started");

  let config: Config;
  try {
    console.log("[TelegramRemote] Loading configuration...");
    config = loadConfig();
    console.log("[TelegramRemote] Configuration loaded successfully");
  } catch (error) {
    console.error("[TelegramRemote] Configuration error:", error);
    return {
      event: async () => { },
    };
  }

  console.log("[TelegramRemote] Creating session title service...");
  const sessionTitleService = new SessionTitleService();

  // Set active chat_id from config if available
  if (config.chatId) {
    console.log(`[TelegramRemote] Setting active chat_id from config: ${config.chatId}`);
    sessionTitleService.setActiveChatId(config.chatId);
  }

  console.log("[TelegramRemote] Creating Telegram bot...");

  const bot = createTelegramBot(config, client, sessionTitleService);
  console.log("[TelegramRemote] Bot created successfully");

  console.log("[TelegramRemote] Starting Telegram bot polling...");
  bot.start().catch((error) => {
    console.error("[TelegramRemote] Failed to start bot:", error);
  });

  let isShuttingDown = false;

  process.on("SIGINT", async () => {
    if (isShuttingDown) {
      console.log("[TelegramRemote] Force exit...");
      process.exit(1);
    }
    isShuttingDown = true;
    console.log("[TelegramRemote] Received SIGINT, stopping bot...");
    try {
      await bot.stop();
      console.log("[TelegramRemote] Bot stopped successfully, exiting...");
      process.exit(0);
    } catch (error) {
      console.error("[TelegramRemote] Error stopping bot:", error);
      process.exit(1);
    }
  });

  process.on("SIGTERM", async () => {
    if (isShuttingDown) {
      console.log("[TelegramRemote] Force exit...");
      process.exit(1);
    }
    isShuttingDown = true;
    console.log("[TelegramRemote] Received SIGTERM, stopping bot...");
    try {
      await bot.stop();
      console.log("[TelegramRemote] Bot stopped successfully, exiting...");
      process.exit(0);
    } catch (error) {
      console.error("[TelegramRemote] Error stopping bot:", error);
      process.exit(1);
    }
  });

  console.log("[TelegramRemote] Plugin initialization complete, returning event handler");

  // Create event handler context
  const eventContext: EventHandlerContext = {
    client,
    bot,
    sessionTitleService,
    config,
  };

  // Event type to handler mapping
  const eventHandlers = {
    "session.updated": handleSessionUpdated,
    "session.status": handleSessionStatus,
    "question.asked": handleQuestionAsked,
  } as const;

  return {
    event: async ({ event }) => {
      const handler = eventHandlers[event.type as keyof typeof eventHandlers];
      if (handler) {
        await handler(event as any, eventContext);
      }
    },
  };
};
