import { Bot, type Context } from "grammy";
import type { OpencodeClient } from "./lib/types.js";
import type { Logger } from "./lib/logger.js";
import type { Config } from "./config.js";
import { SessionStore } from "./session-store.js";
import { sendTemporaryMessage } from "./lib/utils.js";
import { TelegramQueue } from "./lib/telegram-queue.js";

export interface TelegramBotManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(topicId: number, text: string): Promise<void>;
  getForumTopics(groupId: number): Promise<any>;
  createForumTopic(groupId: number, name: string): Promise<any>;
  queue: TelegramQueue;
}

let botInstance: Bot | null = null;

function isUserAllowed(ctx: Context, allowedUserIds: number[]): boolean {
  const userId = ctx.from?.id;
  if (!userId) return false;
  return allowedUserIds.includes(userId);
}

export function createTelegramBot(
  config: Config,
  client: OpencodeClient,
  logger: Logger,
  sessionStore: SessionStore,
): TelegramBotManager {
  console.log("[Bot] createTelegramBot called");

  // Create a shared queue instance for rate limiting
  const queue = new TelegramQueue(500); // 500ms between API calls

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
        await ctx.reply("❌ Failed to create session");
        return;
      }

      const sessionId = createSessionResponse.data.id;
      const sessionTitle = createSessionResponse.data.title || `Session ${sessionId.slice(0, 8)}`;
      const topicName =
        sessionTitle.length > 100 ? `${sessionTitle.slice(0, 97)}...` : sessionTitle;

      // Use queue for createForumTopic to avoid rate limiting
      const topic = await queue.enqueue(() => bot.api.createForumTopic(config.groupId, topicName));
      const topicId = topic.message_thread_id;

      sessionStore.create(topicId, sessionId);

      logger.info("Created new session with topic", {
        sessionId,
        topicId,
        topicName,
      });

      // Use queue for sendMessage to avoid rate limiting
      await queue.enqueue(() =>
        bot.api.sendMessage(config.groupId, `✅ Session created: ${sessionId}`, {
          message_thread_id: topicId,
        }),
      );
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await ctx.reply("❌ Failed to create session");
    }
  });

  bot.on("message:text", async (ctx) => {
    console.log(`[Bot] Text message received: "${ctx.message.text?.slice(0, 50)}..."`);
    if (ctx.chat?.id !== config.groupId) return;
    if (ctx.message.text?.startsWith("/")) return;

    const topicId = ctx.message.message_thread_id;
    console.log(`[Bot] Message in topic: ${topicId}`);
    if (!topicId) {
      const userMessage = ctx.message.text;
      await ctx.reply(`Nothing I can do with this ${userMessage}`);
      return;
    }

    let sessionId = sessionStore.getSessionByTopic(topicId);

    if (!sessionId) {
      try {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await ctx.reply("❌ Failed to initialize session");
          return;
        }

        sessionId = createSessionResponse.data.id;
        sessionStore.create(topicId, sessionId);

        logger.info("Auto-created session for existing topic", {
          sessionId,
          topicId,
        });
      } catch (error) {
        logger.error("Failed to create session", { error: String(error) });
        await ctx.reply("❌ Failed to initialize session");
        return;
      }
    }

    const userMessage = ctx.message.text;

    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: userMessage }],
        },
      });

      if (response.error) {
        logger.error("Failed to send message to OpenCode", {
          error: response.error,
          sessionId,
        });
        await ctx.reply("❌ Failed to process message");
        return;
      }

      logger.debug("Forwarded message to OpenCode", {
        sessionId,
        topicId,
      });
    } catch (error) {
      logger.error("Failed to send message to OpenCode", {
        error: String(error),
        sessionId,
      });
      await ctx.reply("❌ Failed to process message");
    }
  });

  bot.catch((error) => {
    console.error("[Bot] Bot error caught:", error);
    logger.error("Bot error", { error: String(error) });
  });

  console.log("[Bot] All handlers registered, creating bot manager");
  return createBotManager(bot, config, queue);
}

function createBotManager(bot: Bot, config: Config, queue: TelegramQueue): TelegramBotManager {
  return {
    async start() {
      console.log("[Bot] start() called - beginning long polling...");
      await bot.start({
        drop_pending_updates: true,
        onStart: async () => {
          console.log("[Bot] Telegram bot polling started successfully");
          try {
            await sendTemporaryMessage(bot, config.groupId, "Messaging enabled", 1000, queue);
            console.log("[Bot] Startup message sent to group");
          } catch (error) {
            console.error("[Bot] Failed to send startup message:", error);
          }
        },
      });
    },

    async stop() {
      console.log("[Bot] stop() called");
      await bot.stop();
      botInstance = null;
      console.log("[Bot] Bot stopped and instance cleared");
    },

    async sendMessage(topicId: number, text: string) {
      console.log(`[Bot] sendMessage to topic ${topicId}: "${text.slice(0, 50)}..."`);
      // Use queue to avoid rate limiting
      await queue.enqueue(() =>
        bot.api.sendMessage(config.groupId, text, {
          message_thread_id: topicId,
        }),
      );
    },

    async getForumTopics(groupId: number) {
      console.log(`[Bot] getForumTopics called for group ${groupId}`);
      try {
        // Note: Telegram Bot API doesn't provide a direct method to list all forum topics
        // Topics are managed through message_thread_id when messages are sent
        // We'll return an empty list and create topics on-demand instead
        console.log("[Bot] Forum topics listing not available via Bot API, returning empty list");
        return { topics: [] };
      } catch (error) {
        console.error("[Bot] getForumTopics error:", error);
        return { error: String(error), topics: [] };
      }
    },

    async createForumTopic(groupId: number, name: string) {
      console.log(`[Bot] createForumTopic called: "${name}"`);
      // Use queue to avoid rate limiting
      const result = await queue.enqueue(() => bot.api.createForumTopic(groupId, name));
      console.log(`[Bot] Created forum topic with ID: ${result.message_thread_id}`);
      return result;
    },

    queue,
  };
}
