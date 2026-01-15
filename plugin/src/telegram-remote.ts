import type { Plugin } from "@opencode-ai/plugin";
import { createTelegramBot } from "./bot.js";
import { type Config, loadConfig } from "./config.js";
import {
  type EventHandlerContext,
  handleMessagePartUpdated,
  handleMessageUpdated,
  handleSessionCreated,
} from "./events/index.js";
import { createLogger } from "./lib/logger.js";
import { MessageTracker } from "./message-tracker.js";
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
      event: async () => { },
    };
  }

  console.log("[TelegramRemote] Creating session store and message tracker...");
  const sessionStore = new SessionStore();
  const messageTracker = new MessageTracker();

  console.log("[TelegramRemote] Creating Telegram bot...");
  const bot = createTelegramBot(config, client, logger, sessionStore);
  console.log("[TelegramRemote] Bot created successfully");

  // Initialize missing topics for existing sessions (async, non-blocking)
  console.log("[TelegramRemote] Starting async session/topic synchronization...");
  const initializeTopics = async () => {
    try {
      console.log("[TelegramRemote] Fetching existing sessions...");
      const sessionsResponse = await client.session.list();
      console.log("[TelegramRemote] Fetching forum topics...");
      const topicsResponse = await bot.getForumTopics(config.groupId);

      if (sessionsResponse.error) {
        console.error("[TelegramRemote] Failed to list sessions:", sessionsResponse.error);
        logger.error("Failed to list sessions", { error: sessionsResponse.error });
      } else if (topicsResponse.error) {
        console.error("[TelegramRemote] Failed to get forum topics:", topicsResponse.error);
        logger.error("Failed to get forum topics", { error: String(topicsResponse.error) });
      } else {
        const allSessions = sessionsResponse.data || [];
        const topics = topicsResponse.topics || [];

        // Sort sessions by most recently updated and limit to maxSessions
        const sessions = allSessions
          .sort((a, b) => b.time.updated - a.time.updated)
          .slice(0, config.maxSessions);

        console.log(
          `[TelegramRemote] Found ${allSessions.length} total sessions, syncing ${sessions.length} most recent (limit: ${config.maxSessions})`,
        );
        console.log(`[TelegramRemote] Found ${topics.length} existing topics`);

        // Create a map of topic names to topics for quick lookup
        const topicMap = new Map<string, any>();
        for (const topic of topics) {
          topicMap.set(topic.name, topic);
        }

        for (const session of sessions) {
          // Use session title with fallback to session ID
          // Telegram topics have a 128 character limit, so we truncate if needed
          const baseTitle = session.title || `Session ${session.id.slice(0, 8)}`;
          const topicName = baseTitle.length > 100 ? `${baseTitle.slice(0, 97)}...` : baseTitle;
          const existingTopic = topicMap.get(topicName);

          if (!existingTopic) {
            // Create missing topic
            try {
              console.log(
                `[TelegramRemote] Creating topic "${topicName}" for session ${session.id.slice(0, 8)}...`,
              );
              const newTopic = await bot.createForumTopic(config.groupId, topicName);
              sessionStore.create(newTopic.message_thread_id, session.id);
              logger.info("Created topic for existing session", {
                sessionId: session.id,
                topicId: newTopic.message_thread_id,
                topicName,
              });
              console.log(
                `[TelegramRemote] Topic "${topicName}" created for session ${session.id.slice(0, 8)}`,
              );
            } catch (error) {
              console.error(
                `[TelegramRemote] Failed to create topic "${topicName}" for session ${session.id.slice(0, 8)}:`,
                error,
              );
              logger.error("Failed to create topic for session", {
                sessionId: session.id,
                topicName,
                error: String(error),
              });
            }
          } else {
            // Topic exists, add to session store
            sessionStore.create(existingTopic.message_thread_id, session.id);
            console.log(
              `[TelegramRemote] Mapped existing topic "${topicName}" to session ${session.id.slice(0, 8)}`,
            );
          }
        }
        console.log("[TelegramRemote] Session/topic synchronization completed");
      }
    } catch (error) {
      console.error("[TelegramRemote] Failed to initialize topics:", error);
      logger.error("Failed to initialize topics", { error: String(error) });
    }
  };

  // Run initialization in background (non-blocking)
  initializeTopics().catch((error) => {
    console.error("[TelegramRemote] Unexpected error in topic initialization:", error);
  });

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
    sessionStore,
    messageTracker,
  };

  return {
    event: async ({ event }) => {
      console.log(`[TelegramRemote] Event received: ${event.type}`);

      if (event.type === "session.created") {
        await handleSessionCreated(event, eventContext);
      }

      if (event.type === "message.updated") {
        await handleMessageUpdated(event, eventContext);
      }

      if (event.type === "message.part.updated") {
        await handleMessagePartUpdated(event, eventContext);
      }
    },
  };
};
