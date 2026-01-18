import type { Plugin } from "@opencode-ai/plugin";
import { createTelegramBot } from "./bot.js";
import { type Config, loadConfig } from "./config.js";
import {
  type EventHandlerContext,
  handleMessagePartUpdated,
  handleMessageUpdated,
  handleQuestionAsked,
  handleSessionCreated,
  handleSessionStatus,
  handleSessionUpdated,
  handleTodoUpdated,
} from "./events/index.js";

import { GlobalStateStore } from "./global-state-store.js";
import { createLogger } from "./lib/logger.js";
import { QuestionTracker } from "./question-tracker.js";
import { SessionStore } from "./session-store.js";

export const TelegramRemote: Plugin = async ({ client }) => {
  console.log("[TelegramRemote] Plugin initialization started");
  const logger = createLogger(client);

  let config: Config;
  try {
    console.log("[TelegramRemote] Loading configuration...");
    config = loadConfig();
    console.log("[TelegramRemote] Configuration loaded successfully");
  } catch (error) {
    console.error("[TelegramRemote] Configuration error:", error);
    logger.error(`Configuration error: ${error}`);
    return {
      event: async () => {},
    };
  }

  console.log("[TelegramRemote] Creating global state store and question tracker...");
  const questionTracker = new QuestionTracker();
  const sessionStore = new SessionStore();
  const globalStateStore = new GlobalStateStore([
    "file.edited",
    "session.updated",
    "session.status",
    "message.part.updated",
    "message.updated",
    "todo.updated",
  ]);

  console.log("[TelegramRemote] Creating Telegram bot...");
  // Pass questionTracker to createTelegramBot if needed, or better, pass it via commandDeps later inside createTelegramBot
  // But wait, createTelegramBot returns the bot manager which is used in eventContext.
  // The command handlers inside createTelegramBot need questionTracker too.
  // So we should update createTelegramBot signature.
  const bot = createTelegramBot(
    config,
    client,
    logger,
    globalStateStore,
    questionTracker,
    sessionStore,
  );
  console.log("[TelegramRemote] Bot created successfully");

  console.log("[TelegramRemote] Starting Telegram bot polling...");
  bot.start().catch((error) => {
    console.error("[TelegramRemote] Failed to start bot:", error);
    logger.error("Failed to start bot", { error: String(error) });
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
    globalStateStore,
    questionTracker,
    sessionStore,
  };

  // Event type to handler mapping
  const eventHandlers = {
    "session.created": handleSessionCreated,
    "message.updated": handleMessageUpdated,
    "message.part.updated": handleMessagePartUpdated,
    "session.updated": handleSessionUpdated,
    "session.status": handleSessionStatus,
    "question.asked": handleQuestionAsked,
    "todo.updated": handleTodoUpdated,
  } as const;

  return {
    event: async ({ event }) => {
      // console.log(`[TelegramRemote] Event received: ${event.type}`);

      // Write event to debug file
      // writeEventToDebugFile(event, false, []);

      // Store event in global state
      globalStateStore.addEvent(event.type, event);

      const handler = eventHandlers[event.type as keyof typeof eventHandlers];
      if (handler) {
        await handler(event, eventContext);
      }
    },
  };
};
