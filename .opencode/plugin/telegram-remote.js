/**
 * OpenCoder Telegram Remote Plugin
 * https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin
 */

// src/config.ts
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(process.cwd(), ".env") });
function parseAllowedUserIds(value) {
  if (!value || value.trim() === "") {
    return [];
  }
  return value.split(",").map((id) => id.trim()).filter((id) => id !== "").map((id) => Number.parseInt(id, 10)).filter((id) => !Number.isNaN(id));
}
function loadConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
  if (!botToken || botToken.trim() === "") {
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }
  if (!groupId || groupId.trim() === "") {
    throw new Error("Missing required environment variable: TELEGRAM_GROUP_ID");
  }
  const parsedGroupId = Number.parseInt(groupId, 10);
  if (Number.isNaN(parsedGroupId)) {
    throw new Error("TELEGRAM_GROUP_ID must be a valid number");
  }
  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)"
    );
  }
  return {
    botToken,
    groupId: parsedGroupId,
    allowedUserIds
  };
}

// src/lib/config.ts
var SERVICE_NAME = "TelegramRemote";

// src/lib/logger.ts
function log(client, level, message, extra) {
  client.app.log({
    body: {
      service: SERVICE_NAME,
      level,
      message,
      extra
    }
  }).catch(() => {
  });
}
function createLogger(client) {
  return {
    debug: (message, extra) => log(client, "debug", message, extra),
    info: (message, extra) => log(client, "info", message, extra),
    warn: (message, extra) => log(client, "warn", message, extra),
    error: (message, extra) => log(client, "error", message, extra)
  };
}

// src/session-store.ts
var SessionStore = class {
  topicToSession = /* @__PURE__ */ new Map();
  sessionToTopic = /* @__PURE__ */ new Map();
  create(topicId, sessionId) {
    this.topicToSession.set(topicId, sessionId);
    this.sessionToTopic.set(sessionId, topicId);
  }
  getSessionByTopic(topicId) {
    return this.topicToSession.get(topicId);
  }
  getTopicBySession(sessionId) {
    return this.sessionToTopic.get(sessionId);
  }
  has(topicId) {
    return this.topicToSession.has(topicId);
  }
};

// src/message-tracker.ts
var MessageTracker = class {
  userMessages = /* @__PURE__ */ new Set();
  assistantMessages = /* @__PURE__ */ new Set();
  markAsUser(messageId) {
    this.userMessages.add(messageId);
    this.assistantMessages.delete(messageId);
  }
  markAsAssistant(messageId) {
    this.assistantMessages.add(messageId);
    this.userMessages.delete(messageId);
  }
  isAssistant(messageId) {
    return this.assistantMessages.has(messageId);
  }
  isUser(messageId) {
    return this.userMessages.has(messageId);
  }
};

// src/bot.ts
import { Bot } from "grammy";

// src/lib/utils.ts
async function sendTemporaryMessage(bot, chatId, text, durationMs = 1e3) {
  try {
    const sentMessage = await bot.api.sendMessage(chatId, text);
    const messageId = sentMessage.message_id;
    setTimeout(async () => {
      try {
        await bot.api.deleteMessage(chatId, messageId);
      } catch (error) {
        console.warn("Failed to delete temporary message", { error: String(error), messageId });
      }
    }, durationMs);
  } catch (error) {
    console.error("Failed to send temporary message", { error: String(error) });
  }
}

// src/bot.ts
var botInstance = null;
function isUserAllowed(ctx, allowedUserIds) {
  const userId = ctx.from?.id;
  if (!userId) return false;
  return allowedUserIds.includes(userId);
}
function createTelegramBot(config, client, logger, sessionStore) {
  if (botInstance) {
    logger.warn("Bot already initialized, reusing existing instance");
    return createBotManager(botInstance, config);
  }
  const bot = new Bot(config.botToken);
  botInstance = bot;
  bot.use(async (ctx, next) => {
    if (!isUserAllowed(ctx, config.allowedUserIds)) {
      logger.warn("Unauthorized user attempted access", { userId: ctx.from?.id });
      return;
    }
    await next();
  });
  bot.command("new", async (ctx) => {
    if (ctx.chat?.id !== config.groupId) return;
    try {
      const createSessionResponse = await client.session.create({ body: {} });
      if (createSessionResponse.error) {
        logger.error("Failed to create session", { error: createSessionResponse.error });
        await ctx.reply("\u274C Failed to create session");
        return;
      }
      const sessionId = createSessionResponse.data.id;
      const topicName = `Session ${sessionId.slice(0, 8)}`;
      const topic = await bot.api.createForumTopic(config.groupId, topicName);
      const topicId = topic.message_thread_id;
      sessionStore.create(topicId, sessionId);
      logger.info("Created new session with topic", {
        sessionId,
        topicId
      });
      await bot.api.sendMessage(config.groupId, `\u2705 Session created: ${sessionId}`, {
        message_thread_id: topicId
      });
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await ctx.reply("\u274C Failed to create session");
    }
  });
  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.id !== config.groupId) return;
    if (ctx.message.text?.startsWith("/")) return;
    const topicId = ctx.message.message_thread_id;
    if (!topicId) {
      const userMessage2 = ctx.message.text;
      await ctx.reply(`Nothing I can do with this ${userMessage2}`);
      return;
    }
    let sessionId = sessionStore.getSessionByTopic(topicId);
    if (!sessionId) {
      try {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await ctx.reply("\u274C Failed to initialize session");
          return;
        }
        sessionId = createSessionResponse.data.id;
        sessionStore.create(topicId, sessionId);
        logger.info("Auto-created session for existing topic", {
          sessionId,
          topicId
        });
      } catch (error) {
        logger.error("Failed to create session", { error: String(error) });
        await ctx.reply("\u274C Failed to initialize session");
        return;
      }
    }
    const userMessage = ctx.message.text;
    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: userMessage }]
        }
      });
      if (response.error) {
        logger.error("Failed to send message to OpenCode", {
          error: response.error,
          sessionId
        });
        await ctx.reply("\u274C Failed to process message");
        return;
      }
      logger.debug("Forwarded message to OpenCode", {
        sessionId,
        topicId
      });
    } catch (error) {
      logger.error("Failed to send message to OpenCode", {
        error: String(error),
        sessionId
      });
      await ctx.reply("\u274C Failed to process message");
    }
  });
  bot.catch((error) => {
    logger.error("Bot error", { error: String(error) });
  });
  return createBotManager(bot, config);
}
function createBotManager(bot, config) {
  return {
    async start() {
      await bot.start({
        drop_pending_updates: true,
        onStart: async () => {
          console.log("Telegram bot started");
          try {
            await sendTemporaryMessage(bot, config.groupId, "Messaging enabled");
          } catch (error) {
            console.error("Failed to send startup message", error);
          }
        }
      });
    },
    async stop() {
      await bot.stop();
      botInstance = null;
    },
    async sendMessage(topicId, text) {
      await bot.api.sendMessage(config.groupId, text, {
        message_thread_id: topicId
      });
    },
    async getForumTopics(groupId) {
      return await bot.api.getForumTopics(groupId);
    },
    async createForumTopic(groupId, name) {
      return await bot.api.createForumTopic(groupId, name);
    }
  };
}

// src/telegram-remote.ts
var TelegramRemote = async ({ client }) => {
  const logger = createLogger(client);
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    logger.error(`Configuration error: ${error}`);
    return {
      event: async () => {
      }
    };
  }
  const sessionStore = new SessionStore();
  const messageTracker = new MessageTracker();
  const bot = createTelegramBot(config, client, logger, sessionStore);
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
      const topicMap = /* @__PURE__ */ new Map();
      for (const topic of topics) {
        topicMap.set(topic.name, topic);
      }
      for (const session of sessions) {
        const topicName = `Session ${session.id.slice(0, 8)}`;
        const existingTopic = topicMap.get(topicName);
        if (!existingTopic) {
          try {
            const newTopic = await bot.createForumTopic(config.groupId, topicName);
            sessionStore.create(newTopic.message_thread_id, session.id);
            logger.info("Created topic for existing session", {
              sessionId: session.id,
              topicId: newTopic.message_thread_id
            });
          } catch (error) {
            logger.error("Failed to create topic for session", {
              sessionId: session.id,
              error: String(error)
            });
          }
        } else {
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
    bot.stop().catch(() => {
    });
  });
  process.on("SIGTERM", () => {
    bot.stop().catch(() => {
    });
  });
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const sessionId = event.properties.info.id;
        const topicId = sessionStore.getTopicBySession(sessionId);
        if (topicId) {
          await bot.sendMessage(topicId, `\u2705 Session initialized: ${sessionId.slice(0, 8)}`);
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
    }
  };
};
export {
  TelegramRemote
};
