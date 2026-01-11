import { Bot, type Context } from "grammy";
import type { OpencodeClient } from "./lib/types.js";
import type { Logger } from "./lib/logger.js";
import type { Config } from "./config.js";
import { SessionStore } from "./session-store.js";

export interface TelegramBotManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(topicId: number, text: string): Promise<void>;
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
        await ctx.reply("❌ Failed to create session");
        return;
      }

      const sessionId = createSessionResponse.data.id;
      const topicName = `Session ${sessionId.slice(0, 8)}`;
      const topic = await bot.api.createForumTopic(config.groupId, topicName);
      const topicId = topic.message_thread_id;

      sessionStore.create(topicId, sessionId);

      logger.info("Created new session with topic", {
        sessionId,
        topicId,
      });

      await bot.api.sendMessage(config.groupId, `✅ Session created: ${sessionId}`, {
        message_thread_id: topicId,
      });
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await ctx.reply("❌ Failed to create session");
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.id !== config.groupId) return;
    if (ctx.message.text?.startsWith("/")) return;

    const topicId = ctx.message.message_thread_id;
    if (!topicId) {
      logger.debug("Ignoring message without topic");
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
    logger.error("Bot error", { error: String(error) });
  });

  return createBotManager(bot, config);
}

function createBotManager(bot: Bot, config: Config): TelegramBotManager {
  return {
    async start() {
      await bot.start({
        drop_pending_updates: true,
        onStart: () => {
          console.log("Telegram bot started");
        },
      });
    },

    async stop() {
      await bot.stop();
      botInstance = null;
    },

    async sendMessage(topicId: number, text: string) {
      await bot.api.sendMessage(config.groupId, text, {
        message_thread_id: topicId,
      });
    },
  };
}
