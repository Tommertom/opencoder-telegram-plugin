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
  console.log("[Config] Loading environment configuration...");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
  const maxSessionsStr = process.env.TELEGRAM_MAX_SESSIONS;
  if (!botToken || botToken.trim() === "") {
    console.error("[Config] Missing TELEGRAM_BOT_TOKEN");
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }
  if (!groupId || groupId.trim() === "") {
    console.error("[Config] Missing TELEGRAM_GROUP_ID");
    throw new Error("Missing required environment variable: TELEGRAM_GROUP_ID");
  }
  const parsedGroupId = Number.parseInt(groupId, 10);
  if (Number.isNaN(parsedGroupId)) {
    console.error("[Config] Invalid TELEGRAM_GROUP_ID (not a number)");
    throw new Error("TELEGRAM_GROUP_ID must be a valid number");
  }
  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    console.error("[Config] Missing or invalid TELEGRAM_ALLOWED_USER_IDS");
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)"
    );
  }
  let maxSessions = 5;
  if (maxSessionsStr && maxSessionsStr.trim() !== "") {
    const parsed = Number.parseInt(maxSessionsStr, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      maxSessions = parsed;
    } else {
      console.warn(`[Config] Invalid TELEGRAM_MAX_SESSIONS (${maxSessionsStr}), using default: 5`);
    }
  }
  console.log(
    `[Config] Configuration loaded: groupId=${parsedGroupId}, allowedUsers=${allowedUserIds.length}, maxSessions=${maxSessions}`
  );
  return {
    botToken,
    groupId: parsedGroupId,
    allowedUserIds,
    maxSessions
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
  topicToPromptMessageId = /* @__PURE__ */ new Map();
  // topicId -> Telegram message ID
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
  getAllTopicIds() {
    return Array.from(this.topicToSession.keys());
  }
  setPromptMessageId(topicId, messageId) {
    this.topicToPromptMessageId.set(topicId, messageId);
  }
  getPromptMessageId(topicId) {
    return this.topicToPromptMessageId.get(topicId);
  }
  clearPromptMessageId(topicId) {
    this.topicToPromptMessageId.delete(topicId);
  }
  clearAll() {
    this.topicToSession.clear();
    this.sessionToTopic.clear();
    this.topicToPromptMessageId.clear();
  }
};

// src/message-tracker.ts
var MessageTracker = class {
  userMessages = /* @__PURE__ */ new Set();
  assistantMessages = /* @__PURE__ */ new Set();
  messageContent = /* @__PURE__ */ new Map();
  statusMessageIds = /* @__PURE__ */ new Map();
  // messageId -> telegram message ID
  processingPrompts = /* @__PURE__ */ new Map();
  // messageId -> processing flag
  latestUpdates = /* @__PURE__ */ new Map();
  // messageId -> latest update text
  updateIntervals = /* @__PURE__ */ new Map();
  // messageId -> interval handle
  markAsUser(messageId) {
    this.userMessages.add(messageId);
    this.assistantMessages.delete(messageId);
    this.messageContent.delete(messageId);
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
  updateContent(messageId, content) {
    this.messageContent.set(messageId, content);
  }
  getContent(messageId) {
    return this.messageContent.get(messageId);
  }
  clearContent(messageId) {
    this.messageContent.delete(messageId);
  }
  setStatusMessageId(messageId, telegramMessageId) {
    this.statusMessageIds.set(messageId, telegramMessageId);
  }
  getStatusMessageId(messageId) {
    return this.statusMessageIds.get(messageId);
  }
  setProcessingPrompt(messageId, processing) {
    this.processingPrompts.set(messageId, processing);
  }
  isProcessingPrompt(messageId) {
    return this.processingPrompts.get(messageId) || false;
  }
  setLatestUpdate(messageId, text) {
    this.latestUpdates.set(messageId, text);
  }
  getLatestUpdate(messageId) {
    return this.latestUpdates.get(messageId);
  }
  setUpdateInterval(messageId, interval) {
    this.updateIntervals.set(messageId, interval);
  }
  clearUpdateInterval(messageId) {
    const interval = this.updateIntervals.get(messageId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(messageId);
    }
  }
  clearAllTracking(messageId) {
    this.clearUpdateInterval(messageId);
    this.statusMessageIds.delete(messageId);
    this.processingPrompts.delete(messageId);
    this.latestUpdates.delete(messageId);
    this.clearContent(messageId);
  }
};

// src/bot.ts
import { Bot, InputFile } from "grammy";

// src/lib/utils.ts
async function sendTemporaryMessage(bot, chatId, text, durationMs = 1e3, queue) {
  try {
    const sendFn = () => bot.api.sendMessage(chatId, text);
    const sentMessage = queue ? await queue.enqueue(sendFn) : await sendFn();
    const messageId = sentMessage.message_id;
    setTimeout(async () => {
      try {
        const deleteFn = () => bot.api.deleteMessage(chatId, messageId);
        if (queue) {
          await queue.enqueue(deleteFn);
        } else {
          await deleteFn();
        }
      } catch (error) {
        console.warn("Failed to delete temporary message", { error: String(error), messageId });
      }
    }, durationMs);
  } catch (error) {
    console.error("Failed to send temporary message", { error: String(error) });
  }
}

// src/lib/telegram-queue.ts
var TelegramQueue = class {
  queue = [];
  processing = false;
  intervalId = null;
  intervalMs;
  constructor(intervalMs = 500) {
    this.intervalMs = intervalMs;
  }
  /**
   * Add a Telegram API call to the queue
   * @param fn - Async function that makes the Telegram API call
   * @returns Promise that resolves when the call completes
   */
  enqueue(fn) {
    return new Promise((resolve2, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve2(result);
        } catch (error) {
          reject(error);
        }
      });
      if (!this.processing) {
        this.start();
      }
    });
  }
  /**
   * Start processing the queue
   */
  start() {
    if (this.processing) {
      return;
    }
    this.processing = true;
    this.intervalId = setInterval(() => {
      this.processNext();
    }, this.intervalMs);
    this.processNext();
  }
  /**
   * Process the next item in the queue
   */
  async processNext() {
    if (this.queue.length === 0) {
      this.stop();
      return;
    }
    const fn = this.queue.shift();
    if (fn) {
      try {
        await fn();
      } catch (error) {
        console.error("[TelegramQueue] Error processing queue item:", error);
      }
    }
  }
  /**
   * Stop processing the queue
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.processing = false;
  }
  /**
   * Get the current queue size
   */
  get size() {
    return this.queue.length;
  }
  /**
   * Check if the queue is currently processing
   */
  get isProcessing() {
    return this.processing;
  }
  /**
   * Clear all pending items in the queue
   */
  clear() {
    this.queue = [];
    this.stop();
  }
};

// src/bot.ts
var botInstance = null;
function isUserAllowed(ctx, allowedUserIds) {
  const userId = ctx.from?.id;
  if (!userId) return false;
  return allowedUserIds.includes(userId);
}
function createTelegramBot(config, client, logger, sessionStore, messageTracker) {
  console.log("[Bot] createTelegramBot called");
  const queue = new TelegramQueue(500);
  if (botInstance) {
    console.log("[Bot] Reusing existing bot instance");
    logger.warn("Bot already initialized, reusing existing instance");
    return createBotManager(botInstance, config, queue);
  }
  console.log("[Bot] Creating new Bot instance with token");
  const bot = new Bot(config.botToken);
  botInstance = bot;
  console.log("[Bot] Bot instance created");
  console.log("[Bot] Setting up middleware and handlers...");
  bot.use(async (ctx, next) => {
    if (!isUserAllowed(ctx, config.allowedUserIds)) {
      console.log(`[Bot] Unauthorized access attempt from user ${ctx.from?.id}`);
      logger.warn("Unauthorized user attempted access", { userId: ctx.from?.id });
      return;
    }
    await next();
  });
  bot.command("new", async (ctx) => {
    console.log("[Bot] /new command received");
    if (ctx.chat?.id !== config.groupId) return;
    try {
      const createSessionResponse = await client.session.create({ body: {} });
      if (createSessionResponse.error) {
        logger.error("Failed to create session", { error: createSessionResponse.error });
        await ctx.reply("\u274C Failed to create session");
        return;
      }
      const sessionId = createSessionResponse.data.id;
      const sessionTitle = createSessionResponse.data.title || `Session ${sessionId.slice(0, 8)}`;
      const topicName = sessionTitle.length > 100 ? `${sessionTitle.slice(0, 97)}...` : sessionTitle;
      const topic = await queue.enqueue(() => bot.api.createForumTopic(config.groupId, topicName));
      const topicId = topic.message_thread_id;
      sessionStore.create(topicId, sessionId);
      logger.info("Created new session with topic", {
        sessionId,
        topicId,
        topicName
      });
      await queue.enqueue(
        () => bot.api.sendMessage(config.groupId, `\u2705 Session created: ${sessionId}`, {
          message_thread_id: topicId
        })
      );
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await ctx.reply("\u274C Failed to create session");
    }
  });
  bot.command("cleartopics", async (ctx) => {
    console.log("[Bot] /cleartopics command received");
    if (ctx.chat?.id !== config.groupId) return;
    const topicIds = sessionStore.getAllTopicIds().filter((topicId) => topicId !== 1);
    if (topicIds.length === 0) {
      await ctx.reply("No topics to clear.");
      return;
    }
    let deletedCount = 0;
    let failedCount = 0;
    for (const topicId of topicIds) {
      try {
        await queue.enqueue(() => bot.api.deleteForumTopic(config.groupId, topicId));
        deletedCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.error("Failed to delete forum topic", {
          topicId,
          error: String(error)
        });
      }
    }
    sessionStore.clearAll();
    if (failedCount > 0) {
      await ctx.reply(`Cleared ${deletedCount} topics, ${failedCount} failed.`);
    } else {
      await ctx.reply(`Cleared ${deletedCount} topics.`);
    }
  });
  bot.command("deletesessions", async (ctx) => {
    console.log("[Bot] /deletesessions command received");
    if (ctx.chat?.id !== config.groupId) return;
    let deletedSessions = 0;
    let failedSessions = 0;
    try {
      const sessionsResponse = await client.session.list();
      if (sessionsResponse.error) {
        logger.error("Failed to list sessions", { error: sessionsResponse.error });
        await ctx.reply("\u274C Failed to list sessions");
        return;
      }
      const sessions = sessionsResponse.data || [];
      for (const session of sessions) {
        try {
          const deleteResponse = await client.session.delete({
            path: { id: session.id }
          });
          if (deleteResponse.error) {
            failedSessions += 1;
            logger.error("Failed to delete session", {
              sessionId: session.id,
              error: deleteResponse.error
            });
            continue;
          }
          deletedSessions += 1;
        } catch (error) {
          failedSessions += 1;
          logger.error("Failed to delete session", {
            sessionId: session.id,
            error: String(error)
          });
        }
      }
    } catch (error) {
      logger.error("Failed to delete sessions", { error: String(error) });
      await ctx.reply("\u274C Failed to delete sessions");
      return;
    }
    const topicIds = sessionStore.getAllTopicIds().filter((topicId) => topicId !== 1);
    let deletedTopics = 0;
    let failedTopics = 0;
    for (const topicId of topicIds) {
      try {
        await queue.enqueue(() => bot.api.deleteForumTopic(config.groupId, topicId));
        deletedTopics += 1;
      } catch (error) {
        failedTopics += 1;
        logger.error("Failed to delete forum topic", {
          topicId,
          error: String(error)
        });
      }
    }
    sessionStore.clearAll();
    await ctx.reply(
      `Deleted ${deletedSessions} sessions (${failedSessions} failed). Cleared ${deletedTopics} topics (${failedTopics} failed).`
    );
  });
  bot.on("message:text", async (ctx) => {
    console.log(`[Bot] Text message received: "${ctx.message.text?.slice(0, 50)}..."`);
    if (ctx.chat?.id !== config.groupId) return;
    if (ctx.message.text?.startsWith("/")) return;
    const topicId = ctx.message.message_thread_id;
    console.log(`[Bot] Message in topic: ${topicId}`);
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
    const promptMessage = await queue.enqueue(
      () => bot.api.sendMessage(config.groupId, `Prompt: ${userMessage}`, {
        message_thread_id: topicId
      })
    );
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
      sessionStore.setPromptMessageId(topicId, promptMessage.message_id);
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
    console.error("[Bot] Bot error caught:", error);
    logger.error("Bot error", { error: String(error) });
  });
  console.log("[Bot] All handlers registered, creating bot manager");
  return createBotManager(bot, config, queue);
}
function createBotManager(bot, config, queue) {
  return {
    async start() {
      console.log("[Bot] start() called - beginning long polling...");
      await bot.start({
        drop_pending_updates: true,
        onStart: async () => {
          console.log("[Bot] Telegram bot polling started successfully");
          try {
            await sendTemporaryMessage(bot, config.groupId, "Messaging enabled", 1e3, queue);
            console.log("[Bot] Startup message sent to group");
          } catch (error) {
            console.error("[Bot] Failed to send startup message:", error);
          }
        }
      });
    },
    async stop() {
      console.log("[Bot] stop() called");
      await bot.stop();
      botInstance = null;
      console.log("[Bot] Bot stopped and instance cleared");
    },
    async sendMessage(topicId, text) {
      console.log(`[Bot] sendMessage to topic ${topicId}: "${text.slice(0, 50)}..."`);
      await queue.enqueue(
        () => bot.api.sendMessage(config.groupId, text, {
          message_thread_id: topicId
        })
      );
    },
    async editMessage(topicId, messageId, text) {
      console.log(`[Bot] editMessage in topic ${topicId}, message ${messageId}: "${text.slice(0, 50)}..."`);
      await queue.enqueue(
        () => bot.api.editMessageText(
          config.groupId,
          messageId,
          text
        )
      );
    },
    async sendDocument(topicId, document, filename) {
      console.log(`[Bot] sendDocument to topic ${topicId}: filename="${filename}"`);
      await queue.enqueue(
        () => bot.api.sendDocument(
          config.groupId,
          new InputFile(typeof document === "string" ? Buffer.from(document) : document, filename),
          {
            message_thread_id: topicId
          }
        )
      );
    },
    async getForumTopics(groupId) {
      console.log(`[Bot] getForumTopics called for group ${groupId}`);
      try {
        console.log("[Bot] Forum topics listing not available via Bot API, returning empty list");
        return { topics: [] };
      } catch (error) {
        console.error("[Bot] getForumTopics error:", error);
        return { error: String(error), topics: [] };
      }
    },
    async createForumTopic(groupId, name) {
      console.log(`[Bot] createForumTopic called: "${name}"`);
      const result = await queue.enqueue(() => bot.api.createForumTopic(groupId, name));
      console.log(`[Bot] Created forum topic with ID: ${result.message_thread_id}`);
      return result;
    },
    queue
  };
}

// src/telegram-remote.ts
var MAX_MESSAGE_SIZE = 5 * 1024 * 1024;
var TelegramRemote = async ({ client }) => {
  console.log("[TelegramRemote] Plugin initialization started");
  const logger = createLogger(client);
  let config;
  try {
    console.log("[TelegramRemote] Loading configuration...");
    config = loadConfig();
    console.log("[TelegramRemote] Configuration loaded successfully");
  } catch (error) {
    console.error("[TelegramRemote] Configuration error:", error);
    logger.error(`Configuration error: ${error}`);
    return {
      event: async () => {
      }
    };
  }
  console.log("[TelegramRemote] Creating session store and message tracker...");
  const sessionStore = new SessionStore();
  const messageTracker = new MessageTracker();
  console.log("[TelegramRemote] Creating Telegram bot...");
  const bot = createTelegramBot(config, client, logger, sessionStore, messageTracker);
  console.log("[TelegramRemote] Bot created successfully");
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
        const sessions = allSessions.sort((a, b) => b.time.updated - a.time.updated).slice(0, config.maxSessions);
        console.log(
          `[TelegramRemote] Found ${allSessions.length} total sessions, syncing ${sessions.length} most recent (limit: ${config.maxSessions})`
        );
        console.log(`[TelegramRemote] Found ${topics.length} existing topics`);
        const topicMap = /* @__PURE__ */ new Map();
        for (const topic of topics) {
          topicMap.set(topic.name, topic);
        }
        for (const session of sessions) {
          const baseTitle = session.title || `Session ${session.id.slice(0, 8)}`;
          const topicName = baseTitle.length > 100 ? `${baseTitle.slice(0, 97)}...` : baseTitle;
          const existingTopic = topicMap.get(topicName);
          if (!existingTopic) {
            try {
              console.log(
                `[TelegramRemote] Creating topic "${topicName}" for session ${session.id.slice(0, 8)}...`
              );
              const newTopic = await bot.createForumTopic(config.groupId, topicName);
              sessionStore.create(newTopic.message_thread_id, session.id);
              logger.info("Created topic for existing session", {
                sessionId: session.id,
                topicId: newTopic.message_thread_id,
                topicName
              });
              console.log(
                `[TelegramRemote] Topic "${topicName}" created for session ${session.id.slice(0, 8)}`
              );
            } catch (error) {
              console.error(
                `[TelegramRemote] Failed to create topic "${topicName}" for session ${session.id.slice(0, 8)}:`,
                error
              );
              logger.error("Failed to create topic for session", {
                sessionId: session.id,
                topicName,
                error: String(error)
              });
            }
          } else {
            sessionStore.create(existingTopic.message_thread_id, session.id);
            console.log(
              `[TelegramRemote] Mapped existing topic "${topicName}" to session ${session.id.slice(0, 8)}`
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
  return {
    event: async ({ event }) => {
      console.log(`[TelegramRemote] Event received: ${event.type}`);
      if (event.type === "session.created") {
        const sessionId = event.properties.info.id;
        const topicId = sessionStore.getTopicBySession(sessionId);
        console.log(
          `[TelegramRemote] Session created: ${sessionId.slice(0, 8)}, topicId: ${topicId}`
        );
        if (topicId) {
          await bot.sendMessage(topicId, `\u2705 Session initialized: ${sessionId.slice(0, 8)}`);
        }
      }
      if (event.type === "message.updated") {
        const message = event.properties.info;
        console.log(`[TelegramRemote] Message updated: ${message.id}, role: ${message.role}`);
        if (message.role === "user") {
          messageTracker.markAsUser(message.id);
        } else if (message.role === "assistant") {
          messageTracker.markAsAssistant(message.id);
          const topicId = sessionStore.getTopicBySession(message.sessionID);
          if (topicId) {
            const promptMessageId = sessionStore.getPromptMessageId(topicId);
            if (promptMessageId) {
              messageTracker.setStatusMessageId(message.id, promptMessageId);
              messageTracker.setProcessingPrompt(message.id, true);
              sessionStore.clearPromptMessageId(topicId);
              console.log(
                `[TelegramRemote] Linked prompt message ${promptMessageId} to assistant message ${message.id}`
              );
            }
          }
          if (message.time?.completed) {
            messageTracker.setProcessingPrompt(message.id, false);
            messageTracker.clearUpdateInterval(message.id);
            const content = messageTracker.getContent(message.id);
            if (content) {
              const lines = content.split("\n");
              if (lines.length > 100) {
                const topicId2 = sessionStore.getTopicBySession(message.sessionID);
                if (topicId2) {
                  console.log(
                    `[TelegramRemote] Message ${message.id} completed with ${lines.length} lines. Sending as Markdown file.`
                  );
                  try {
                    await bot.sendDocument(topicId2, content, "response.md");
                  } catch (error) {
                    console.error("[TelegramRemote] Failed to send document:", error);
                    logger.error("Failed to send document", { error: String(error) });
                  }
                }
              }
              messageTracker.clearAllTracking(message.id);
            }
          }
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
        if (delta) {
          const currentContent = messageTracker.getContent(part.messageID) || "";
          if (currentContent.length + delta.length > MAX_MESSAGE_SIZE) {
            console.warn(
              `[TelegramRemote] Message ${part.messageID} exceeded ${MAX_MESSAGE_SIZE} bytes. Truncating.`
            );
          } else {
            messageTracker.updateContent(part.messageID, currentContent + delta);
          }
        }
        const fullText = messageTracker.getContent(part.messageID) || "";
        const statusMessageId = messageTracker.getStatusMessageId(part.messageID);
        const hasInterval = messageTracker.getLatestUpdate(part.messageID) !== void 0;
        if (statusMessageId && !hasInterval) {
          console.log(
            `[TelegramRemote] First update for message ${part.messageID}, updating status message`
          );
          try {
            await bot.editMessage(topicId, statusMessageId, fullText || "Processing...");
            messageTracker.setLatestUpdate(part.messageID, fullText);
            let lastSentText = fullText;
            const updateInterval = setInterval(async () => {
              if (!messageTracker.isProcessingPrompt(part.messageID)) {
                console.log(
                  `[TelegramRemote] Processing complete for message ${part.messageID}, stopping interval`
                );
                messageTracker.clearUpdateInterval(part.messageID);
                return;
              }
              const currentLatest = messageTracker.getLatestUpdate(part.messageID);
              if (currentLatest && currentLatest !== lastSentText) {
                try {
                  await bot.editMessage(topicId, statusMessageId, currentLatest);
                  lastSentText = currentLatest;
                  console.log(
                    `[TelegramRemote] Updated status message for ${part.messageID}`
                  );
                } catch (error) {
                  console.error(
                    `[TelegramRemote] Failed to update status message:`,
                    error
                  );
                }
              }
            }, 500);
            messageTracker.setUpdateInterval(part.messageID, updateInterval);
            console.log(
              `[TelegramRemote] Started update interval for message ${part.messageID}`
            );
          } catch (error) {
            console.error(
              `[TelegramRemote] Failed to update status message:`,
              error
            );
          }
        } else if (statusMessageId && hasInterval) {
          console.log(
            `[TelegramRemote] Subsequent update for message ${part.messageID}, updating latestUpdate`
          );
          messageTracker.setLatestUpdate(part.messageID, fullText);
        }
      }
    }
  };
};
export {
  TelegramRemote
};
