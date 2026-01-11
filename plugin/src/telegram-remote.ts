import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";
import { createLogger } from "./lib/logger.js";
import { SessionStore } from "./session-store.js";
import { MessageTracker } from "./message-tracker.js";
import { createTelegramBot } from "./bot.js";

export const TelegramRemote: Plugin = async ({ client }) => {
  const logger = createLogger(client);

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    logger.error(`Configuration error: ${error}`);
    return {
      event: async () => {},
    };
  }

  const sessionStore = new SessionStore();
  const messageTracker = new MessageTracker();
  const bot = createTelegramBot(config, client, logger, sessionStore);

  bot.start().catch((error) => {
    logger.error("Failed to start bot", { error: String(error) });
  });

  process.on("SIGINT", () => {
    bot.stop().catch(() => {});
  });

  process.on("SIGTERM", () => {
    bot.stop().catch(() => {});
  });

  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const sessionId = event.properties.info.id;
        const topicId = sessionStore.getTopicBySession(sessionId);

        if (topicId) {
          await bot.sendMessage(topicId, `✅ Session initialized: ${sessionId.slice(0, 8)}`);
        }
      }

      if (event.type === "message.updated") {
        const message = event.properties.info;
        if (message.role === "user") {
          messageTracker.markAsUser(message.id);
        } else if (message.role === "assistant") {
          messageTracker.markAsAssistant(message.id);
        }
      }

      if (event.type === "message.part.updated") {
        const part = event.properties.part;
        if (part.type !== "text") {
          return;
        }

        const isAssistantMessage = messageTracker.isAssistant(part.messageID);
        if (!isAssistantMessage) {
          return;
        }

        const sessionId = part.sessionID;
        const topicId = sessionStore.getTopicBySession(sessionId);

        if (!topicId) {
          logger.debug("No topic found for session", { sessionId });
          return;
        }

        const delta = event.properties.delta;
        if (delta && delta.trim()) {
          await bot.sendMessage(topicId, delta);
        }
      }
    },
  };
};
