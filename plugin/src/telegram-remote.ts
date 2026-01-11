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

  // Initialize missing topics for existing sessions
  try {
    const sessionsResponse = await client.session.list();
    const topicsResponse = await bot.getForumTopics(config.groupId);

    if (sessionsResponse.error) {
      logger.error("Failed to list sessions", { error: sessionsResponse.error });
    } else if (topicsResponse.error) {
      logger.error("Failed to get forum topics", { error: String(topicsResponse.error) });
    } else {
      const sessions = sessionsResponse.data || [];
      console.log(sessions);
      const topics = topicsResponse.topics || [];

      // Create a map of topic names to topics for quick lookup
      const topicMap = new Map<string, any>();
      for (const topic of topics) {
        topicMap.set(topic.name, topic);
      }

      for (const session of sessions) {
        const topicName = `Session ${session.id.slice(0, 8)}`;
        const existingTopic = topicMap.get(topicName);

        if (!existingTopic) {
          // Create missing topic
          try {
            const newTopic = await bot.createForumTopic(config.groupId, topicName);
            sessionStore.create(newTopic.message_thread_id, session.id);
            logger.info("Created topic for existing session", {
              sessionId: session.id,
              topicId: newTopic.message_thread_id,
            });
          } catch (error) {
            logger.error("Failed to create topic for session", {
              sessionId: session.id,
              error: String(error),
            });
          }
        } else {
          // Topic exists, add to session store
          sessionStore.create(existingTopic.message_thread_id, session.id);
        }
      }
    }
  } catch (error) {
    logger.error("Failed to initialize topics", { error: String(error) });
  }

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
