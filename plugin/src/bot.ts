import { Bot, type Context, InputFile } from "grammy";
import { createClearTopicsCommandHandler } from "./commands/cleartopics.js";
import { createDeleteSessionsCommandHandler } from "./commands/deletesessions.js";
import { createMessageTextHandler } from "./commands/message-text.command.js";
import { createNewCommandHandler } from "./commands/new.js";
import type { Config } from "./config.js";
import type { Logger } from "./lib/logger.js";
import { TelegramQueue } from "./lib/telegram-queue.js";
import type { OpencodeClient } from "./lib/types.js";
import { sendTemporaryMessage } from "./lib/utils.js";
import type { SessionStore } from "./session-store.js";

export interface TelegramBotManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(topicId: number, text: string): Promise<void>;
  editMessage(topicId: number, messageId: number, text: string): Promise<void>;
  getForumTopics(groupId: number): Promise<any>;
  createForumTopic(groupId: number, name: string): Promise<any>;
  queue: TelegramQueue;
  sendDocument(topicId: number, document: string | Uint8Array, filename: string): Promise<void>;
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

  const commandDeps = {
    bot,
    config,
    client,
    logger,
    sessionStore,
    queue,
  };

  bot.command("new", createNewCommandHandler(commandDeps));
  bot.command("cleartopics", createClearTopicsCommandHandler(commandDeps));
  bot.command("deletesessions", createDeleteSessionsCommandHandler(commandDeps));

  bot.on("message:text", createMessageTextHandler(commandDeps));

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

    async editMessage(topicId: number, messageId: number, text: string) {
      console.log(
        `[Bot] editMessage in topic ${topicId}, message ${messageId}: "${text.slice(0, 50)}..."`,
      );
      // Use queue to avoid rate limiting
      await queue.enqueue(() => bot.api.editMessageText(config.groupId, messageId, text));
    },

    async sendDocument(topicId: number, document: string | Uint8Array, filename: string) {
      console.log(`[Bot] sendDocument to topic ${topicId}: filename="${filename}"`);
      await queue.enqueue(() =>
        bot.api.sendDocument(
          config.groupId,
          new InputFile(typeof document === "string" ? Buffer.from(document) : document, filename),
          {
            message_thread_id: topicId,
          },
        ),
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
