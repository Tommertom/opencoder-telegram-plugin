import type { createTelegramBot } from "../bot.js";
import type { OpencodeClient } from "../lib/types.js";
import type { MessageTracker } from "../message-tracker.js";
import type { SessionStore } from "../session-store.js";

export type TelegramBot = ReturnType<typeof createTelegramBot>;

export interface EventHandlerContext {
    client: OpencodeClient;
    bot: TelegramBot;
    sessionStore: SessionStore;
    messageTracker: MessageTracker;
}
