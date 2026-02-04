import { Bot, type Context } from "grammy";
import type { Config } from "./config.js";
import type { SessionTitleService } from "./services/session-title-service.js";
import type { OpencodeClient } from "./events/types.js";

export interface TelegramBotManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(text: string, options?: any): Promise<{ message_id: number }>;
  editMessage(messageId: number, text: string): Promise<void>;
  deleteMessage(messageId: number): Promise<void>;
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
  sessionTitleService: SessionTitleService,
): TelegramBotManager {
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

      // Notify user of their chat_id when first discovered
      if (isNewChatId) {
        console.log(`[Bot] New chat_id discovered: ${ctx.chat.id}`);
        await ctx.reply(
          `✅ Chat connected!\n\nYour chat_id: ${ctx.chat.id}\n\nThis chat is now active for OpenCode notifications.`
        );
      }
    }
    await next();
  });

  // Create the manager
  const manager = createBotManager(bot, sessionTitleService);

  bot.catch((error) => {
    console.error("[Bot] Bot error caught:", error);
  });

  console.log("[Bot] All handlers registered, returning bot manager");
  return manager;
}

function requireActiveChatId(
  sessionTitleService: SessionTitleService,
  action: string,
): number {
  const chatId = sessionTitleService.getActiveChatId();
  if (!chatId) {
    const message = `No active chat available for ${action}. Ask an allowed user to message the bot first.`;
    console.warn(message);
    throw new Error(message);
  }
  return chatId;
}

function createBotManager(
  bot: Bot,
  sessionTitleService: SessionTitleService,
): TelegramBotManager {
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
            const msg = await bot.api.sendMessage(chatId, "Messaging enabled");
            // Delete after 1 second
            setTimeout(() => {
              bot.api.deleteMessage(chatId, msg.message_id).catch(console.error);
            }, 1000);
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
      const chatId = requireActiveChatId(sessionTitleService, "sendMessage");
      const result = await bot.api.sendMessage(chatId, text, options);
      return { message_id: result.message_id };
    },

    async editMessage(messageId: number, text: string) {
      console.log(`[Bot] editMessage ${messageId}: "${text.slice(0, 50)}..."`);
      const chatId = requireActiveChatId(sessionTitleService, "editMessage");
      await bot.api.editMessageText(chatId, messageId, text);
    },

    async deleteMessage(messageId: number) {
      console.log(`[Bot] deleteMessage ${messageId}`);
      const chatId = requireActiveChatId(sessionTitleService, "deleteMessage");
      await bot.api.deleteMessage(chatId, messageId);
    },

    async sendTemporaryMessage(text: string, durationMs: number = 10000, options?: any) {
      console.log(
        `[Bot] sendTemporaryMessage: "${text.slice(0, 50)}..." (duration: ${durationMs}ms)`,
      );
      const chatId = requireActiveChatId(sessionTitleService, "sendTemporaryMessage");
      const msg = await bot.api.sendMessage(chatId, text, options);
      // Delete after the specified duration
      setTimeout(() => {
        bot.api.deleteMessage(chatId, msg.message_id).catch(console.error);
      }, durationMs);
    },
  };
}
