import { Bot, type Context, InputFile } from "grammy";
import { createDeleteSessionsCommandHandler } from "./commands/deletesessions.js";
import { createHelpCommandHandler } from "./commands/help.js";
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
  sendMessage(text: string): Promise<void>;
  editMessage(messageId: number, text: string): Promise<void>;
  queue: TelegramQueue;
  sendDocument(document: string | Uint8Array, filename: string): Promise<void>;
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

  // Create the manager and pass the manager into command handlers so they
  // can use the convenience methods (createForumTopic, deleteForumTopic, getForumTopics, sendMessage, etc.)
  const manager = createBotManager(bot, config, queue);

  const commandDeps = {
    bot: manager,
    config,
    client,
    logger,
    sessionStore,
    queue,
  };

  bot.command("new", createNewCommandHandler(commandDeps));
  bot.command("deletesessions", createDeleteSessionsCommandHandler(commandDeps));
  bot.command("help", createHelpCommandHandler(commandDeps));

  bot.on("message:text", createMessageTextHandler(commandDeps));

  bot.catch((error) => {
    console.error("[Bot] Bot error caught:", error);
    logger.error("Bot error", { error: String(error) });
  });

  console.log("[Bot] All handlers registered, returning bot manager");
  return manager;
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

    async sendMessage(text: string) {
      console.log(`[Bot] sendMessage: "${text.slice(0, 50)}..."`);
      // Use queue to avoid rate limiting
      await queue.enqueue(() => bot.api.sendMessage(config.groupId, text));
    },

    async editMessage(messageId: number, text: string) {
      console.log(`[Bot] editMessage ${messageId}: "${text.slice(0, 50)}..."`);
      // Use queue to avoid rate limiting
      await queue.enqueue(() => bot.api.editMessageText(config.groupId, messageId, text));
    },

    async sendDocument(document: string | Uint8Array, filename: string) {
      console.log(`[Bot] sendDocument: filename="${filename}"`);
      await queue.enqueue(() =>
        bot.api.sendDocument(
          config.groupId,
          new InputFile(typeof document === "string" ? Buffer.from(document) : document, filename),
        ),
      );
    },

    queue,
  };
}
