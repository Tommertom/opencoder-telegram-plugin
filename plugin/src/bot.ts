import { Bot, type Context, InputFile, Keyboard } from "grammy";
import {
  createAgentsCallbackHandler,
  createModelsCallbackHandler,
  createQuestionCallbackHandler,
} from "./callbacks/index.js";
import { createAudioMessageHandler } from "./commands/audio-message.command.js";
import {
  createAgentsCommandHandler,
  createDeleteSessionsCommandHandler,
  createEscCommandHandler,
  createHelpCommandHandler,
  createMessageTextHandler,
  createModelsCommandHandler,
  createNewCommandHandler,
  createSessionsCommandHandler,
  createTabCommandHandler,
  createTodosCommandHandler,
} from "./commands/index.js";
import type { Config } from "./config.js";
import type { GlobalStateStore } from "./global-state-store.js";
import { createDefaultKeyboard } from "./lib/keyboard.js";
import type { Logger } from "./lib/logger.js";
import type { OpencodeClient } from "./lib/types.js";
import { sendTemporaryMessage } from "./lib/utils.js";
import type { QuestionTracker } from "./question-tracker.js";
import { TelegramQueue } from "./services/telegram-queue.service.js";

export interface TelegramBotManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(text: string, options?: any): Promise<{ message_id: number }>;
  editMessage(messageId: number, text: string): Promise<void>;
  deleteMessage(messageId: number): Promise<void>;
  queue: TelegramQueue;
  sendDocument(document: string | Uint8Array, filename: string): Promise<void>;
  sendTemporaryMessage(text: string, durationMs?: number, options?: any): Promise<void>;
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
  globalStateStore: GlobalStateStore,
  questionTracker: QuestionTracker,
): TelegramBotManager {
  console.log("[Bot] createTelegramBot called");

  // Create a shared queue instance for rate limiting
  const queue = new TelegramQueue(500); // 500ms between API calls

  if (botInstance) {
    console.log("[Bot] Reusing existing bot instance");
    logger.warn("Bot already initialized, reusing existing instance");
    return createBotManager(botInstance, queue, globalStateStore, logger);
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
    if (ctx.chat?.type !== "private") {
      logger.warn("Ignoring non-private chat", {
        chatId: ctx.chat?.id,
        chatType: ctx.chat?.type,
      });
      return;
    }
    if (ctx.chat?.id) {
      globalStateStore.setActiveChatId(ctx.chat.id);
    }
    await next();
  });

  // Create the manager and pass the manager into command handlers so they
  // can use the convenience methods (createForumTopic, deleteForumTopic, getForumTopics, sendMessage, etc.)
  const manager = createBotManager(bot, queue, globalStateStore, logger);

  const commandDeps = {
    bot: manager,
    config,
    client,
    logger,
    globalStateStore,
    queue,
    questionTracker,
  };

  bot.command("new", createNewCommandHandler(commandDeps));
  bot.command("deletesessions", createDeleteSessionsCommandHandler(commandDeps));
  bot.command("sessions", createSessionsCommandHandler(commandDeps));
  bot.command("agents", createAgentsCommandHandler(commandDeps));
  bot.command("models", createModelsCommandHandler(commandDeps));
  bot.command("help", createHelpCommandHandler(commandDeps));
  bot.command("tab", createTabCommandHandler(commandDeps));
  bot.command("esc", createEscCommandHandler(commandDeps));
  bot.command("todos", createTodosCommandHandler(commandDeps));

  bot.on("message:text", createMessageTextHandler(commandDeps));
  bot.on("message:voice", createAudioMessageHandler(commandDeps));
  bot.on("message:audio", createAudioMessageHandler(commandDeps));

  // Register callback query handler for questions
  // We use regex to route specific callback data to the correct handler
  // This prevents one handler from blocking the other since they don't call next()
  bot.callbackQuery(/^(session:|q:)/, createQuestionCallbackHandler(commandDeps));
  bot.callbackQuery(/^agent:/, createAgentsCallbackHandler(commandDeps));
  bot.callbackQuery(/^model:/, createModelsCallbackHandler(commandDeps));

  bot.catch((error) => {
    console.error("[Bot] Bot error caught:", error);
    logger.error("Bot error", { error: String(error) });
  });

  console.log("[Bot] All handlers registered, returning bot manager");
  return manager;
}

function requireActiveChatId(
  globalStateStore: GlobalStateStore,
  logger: Logger,
  action: string,
): number {
  const chatId = globalStateStore.getActiveChatId();
  if (!chatId) {
    const message = `No active chat available for ${action}. Ask an allowed user to message the bot first.`;
    logger.warn(message);
    throw new Error(message);
  }
  return chatId;
}

function createBotManager(
  bot: Bot,
  queue: TelegramQueue,
  globalStateStore: GlobalStateStore,
  logger: Logger,
): TelegramBotManager {
  return {
    async start() {
      console.log("[Bot] start() called - beginning long polling...");
      await bot.start({
        drop_pending_updates: true,
        onStart: async () => {
          console.log("[Bot] Telegram bot polling started successfully");
          try {
            const chatId = globalStateStore.getActiveChatId();
            if (!chatId) {
              console.log("[Bot] No active chat yet; skipping startup message");
              return;
            }
            await sendTemporaryMessage(bot, chatId, "Messaging enabled", 1000, queue);
            console.log("[Bot] Startup message sent to active chat");
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

    async sendMessage(text: string, options?: any) {
      console.log(`[Bot] sendMessage: "${text.slice(0, 50)}..."`);
      const chatId = requireActiveChatId(globalStateStore, logger, "sendMessage");
      // Add default keyboard if no reply_markup is provided
      const mergedOptions = {
        ...options,
        reply_markup: options?.reply_markup || createDefaultKeyboard(),
      };
      // Use queue to avoid rate limiting
      const result = await queue.enqueue(() => bot.api.sendMessage(chatId, text, mergedOptions));
      return { message_id: result.message_id };
    },

    async editMessage(messageId: number, text: string) {
      console.log(`[Bot] editMessage ${messageId}: "${text.slice(0, 50)}..."`);
      const chatId = requireActiveChatId(globalStateStore, logger, "editMessage");
      // Use queue to avoid rate limiting
      await queue.enqueue(() => bot.api.editMessageText(chatId, messageId, text));
    },

    async deleteMessage(messageId: number) {
      console.log(`[Bot] deleteMessage ${messageId}`);
      const chatId = requireActiveChatId(globalStateStore, logger, "deleteMessage");
      await queue.enqueue(() => bot.api.deleteMessage(chatId, messageId));
    },

    async sendDocument(document: string | Uint8Array, filename: string) {
      console.log(`[Bot] sendDocument: filename="${filename}"`);
      const chatId = requireActiveChatId(globalStateStore, logger, "sendDocument");
      await queue.enqueue(() =>
        bot.api.sendDocument(
          chatId,
          new InputFile(typeof document === "string" ? Buffer.from(document) : document, filename),
        ),
      );
    },

    async sendTemporaryMessage(text: string, durationMs: number = 10000, options?: any) {
      console.log(
        `[Bot] sendTemporaryMessage: "${text.slice(0, 50)}..." (duration: ${durationMs}ms)`,
      );
      const chatId = requireActiveChatId(globalStateStore, logger, "sendTemporaryMessage");
      await sendTemporaryMessage(bot, chatId, text, durationMs, queue, options);
    },

    queue,
  };
}
