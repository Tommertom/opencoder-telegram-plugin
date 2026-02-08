/**
 * OpenCoder Telegram Remote Plugin
 * https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin
 */

// src/bot.ts
import { Bot } from "grammy";
var botInstance = null;
function isUserAllowed(ctx, allowedUserIds) {
  const userId = ctx.from?.id;
  if (!userId) return false;
  return allowedUserIds.includes(userId);
}
function createTelegramBot(config, client, sessionTitleService) {
  console.log("[Bot] createTelegramBot called");
  if (botInstance) {
    console.log("[Bot] Reusing existing bot instance");
    return createBotManager(botInstance, sessionTitleService);
  }
  console.log("[Bot] Creating new Bot instance with token");
  const bot = new Bot(config.botToken);
  botInstance = bot;
  console.log("[Bot] Bot instance created");
  console.log("[Bot] Setting up middleware and handlers...");
  bot.use(async (ctx, next) => {
    if (!isUserAllowed(ctx, config.allowedUserIds)) {
      console.log(`[Bot] Unauthorized access attempt from user ${ctx.from?.id}`);
      return;
    }
    if (ctx.chat?.type !== "private") {
      return;
    }
    if (ctx.chat?.id) {
      const previousChatId = sessionTitleService.getActiveChatId();
      const isNewChatId = previousChatId !== ctx.chat.id;
      sessionTitleService.setActiveChatId(ctx.chat.id);
      if (isNewChatId) {
        console.log(`[Bot] New chat_id discovered: ${ctx.chat.id}`);
        await ctx.reply(
          `\u2705 Chat connected!

Your chat_id: ${ctx.chat.id}

This chat is now active for OpenCode notifications.`
        );
      }
    }
    await next();
  });
  const manager = createBotManager(bot, sessionTitleService);
  bot.catch((error) => {
    console.error("[Bot] Bot error caught:", error);
  });
  console.log("[Bot] All handlers registered, returning bot manager");
  return manager;
}
function requireActiveChatId(sessionTitleService, action) {
  const chatId = sessionTitleService.getActiveChatId();
  if (!chatId) {
    const message = `No active chat available for ${action}. Ask an allowed user to message the bot first.`;
    console.warn(message);
    throw new Error(message);
  }
  return chatId;
}
function createBotManager(bot, sessionTitleService) {
  return {
    async start() {
      console.log("[Bot] start() called - beginning long polling...");
      await bot.start({
        drop_pending_updates: true,
        onStart: async () => {
          console.log("[Bot] Telegram bot polling started successfully");
          try {
            const chatId = sessionTitleService.getActiveChatId();
            if (!chatId) {
              console.log("[Bot] No active chat yet; skipping startup message");
              return;
            }
            await bot.api.sendMessage(chatId, "Messaging enabled");
            console.log("[Bot] Startup message sent to active chat");
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
    async sendMessage(text, options) {
      console.log(`[Bot] sendMessage: "${text.slice(0, 50)}..."`);
      const chatId = requireActiveChatId(sessionTitleService, "sendMessage");
      const result = await bot.api.sendMessage(chatId, text, options);
      return { message_id: result.message_id };
    },
    async editMessage(messageId, text) {
      console.log(`[Bot] editMessage ${messageId}: "${text.slice(0, 50)}..."`);
      const chatId = requireActiveChatId(sessionTitleService, "editMessage");
      await bot.api.editMessageText(chatId, messageId, text);
    },
    async deleteMessage(messageId) {
      console.log(`[Bot] deleteMessage ${messageId}`);
      const chatId = requireActiveChatId(sessionTitleService, "deleteMessage");
      await bot.api.deleteMessage(chatId, messageId);
    }
  };
}

// src/config.ts
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
loadEnv({ path: resolve(__dirname, "..", "..", ".env") });
loadEnv({ path: resolve(__dirname, "..", ".env") });
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
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
  const chatIdStr = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || botToken.trim() === "") {
    console.error("[Config] Missing TELEGRAM_BOT_TOKEN");
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }
  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    console.error("[Config] Missing or invalid TELEGRAM_ALLOWED_USER_IDS");
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)"
    );
  }
  let chatId;
  if (chatIdStr && chatIdStr.trim() !== "") {
    const parsed = Number.parseInt(chatIdStr.trim(), 10);
    if (!Number.isNaN(parsed)) {
      chatId = parsed;
      console.log(`[Config] Chat ID configured: ${chatId}`);
    } else {
      console.warn(`[Config] Invalid TELEGRAM_CHAT_ID: ${chatIdStr}`);
    }
  }
  console.log(
    `[Config] Configuration loaded: allowedUsers=${allowedUserIds.length}`
  );
  return {
    botToken,
    allowedUserIds,
    chatId
  };
}

// src/events/session-status.ts
async function handleSessionStatus(event, context) {
  const statusType = event?.properties?.status?.type;
  if (statusType) {
    if (statusType === "idle") {
      try {
        const sessionId = event?.properties?.info?.id ?? event?.properties?.sessionID ?? event?.properties?.id;
        let message = "Agent has finished.";
        if (sessionId && context.sessionTitleService) {
          const title = context.sessionTitleService.getSessionTitle(sessionId);
          if (title) {
            message = `Agent has finished: ${title}`;
          }
        }
        await context.bot.sendMessage(message);
      } catch (error) {
        console.error("[TelegramRemote] Failed to send idle notification:");
      }
    }
  }
}

// src/events/session-updated.ts
async function handleSessionUpdated(event, context) {
  const title = event?.properties?.info?.title;
  const sessionId = event?.properties?.info?.id ?? event?.properties?.sessionID ?? event?.properties?.id;
  if (title && context.sessionTitleService) {
    if (typeof sessionId === "string" && sessionId.trim()) {
      context.sessionTitleService.setSessionTitle(sessionId, title);
    }
  }
}

// src/events/question-asked.ts
async function handleQuestionAsked(event, context) {
  const sessionID = event?.properties?.sessionID;
  const questions = event?.properties?.questions;
  if (sessionID && questions && Array.isArray(questions) && questions.length > 0 && context.bot) {
    const sessionTitle = context.sessionTitleService.getSessionTitle(sessionID);
    const titleText = sessionTitle ? `\u{1F4CB} ${sessionTitle}` : `Session: ${sessionID}`;
    const questionTexts = questions.map((q, index) => {
      const header = q.header ? `${q.header}: ` : "";
      return `${index + 1}. ${header}${q.question}`;
    }).join("\n");
    const message = `${titleText}

\u2753 Questions:
${questionTexts}`;
    try {
      await context.bot.sendMessage(message);
    } catch (error) {
      console.error("[TelegramRemote] Failed to send question notification:", error);
    }
  }
}

// src/services/session-title-service.ts
var SessionTitleService = class {
  sessionTitles = /* @__PURE__ */ new Map();
  activeChatId = null;
  setSessionTitle(sessionId, title) {
    this.sessionTitles.set(sessionId, title);
  }
  getSessionTitle(sessionId) {
    return this.sessionTitles.get(sessionId) ?? null;
  }
  setActiveChatId(chatId) {
    this.activeChatId = chatId;
  }
  getActiveChatId() {
    return this.activeChatId;
  }
  clearActiveChatId() {
    this.activeChatId = null;
  }
};

// src/telegram-remote.ts
var TelegramRemote = async ({ client }) => {
  console.log("[TelegramRemote] Plugin initialization started");
  let config;
  try {
    console.log("[TelegramRemote] Loading configuration...");
    config = loadConfig();
    console.log("[TelegramRemote] Configuration loaded successfully");
  } catch (error) {
    console.error("[TelegramRemote] Configuration error:", error);
    return {
      event: async () => {
      }
    };
  }
  console.log("[TelegramRemote] Creating session title service...");
  const sessionTitleService = new SessionTitleService();
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
  const eventContext = {
    client,
    bot,
    sessionTitleService,
    config
  };
  const eventHandlers = {
    "session.updated": handleSessionUpdated,
    "session.status": handleSessionStatus,
    "question.asked": handleQuestionAsked
  };
  return {
    event: async ({ event }) => {
      const handler = eventHandlers[event.type];
      if (handler) {
        await handler(event, eventContext);
      }
    }
  };
};
export {
  TelegramRemote
};
