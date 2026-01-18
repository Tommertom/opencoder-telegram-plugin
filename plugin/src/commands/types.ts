import type { TelegramBotManager } from "../bot.js";
import type { Config } from "../config.js";
import type { GlobalStateStore } from "../global-state-store.js";
import type { Logger } from "../lib/logger.js";
import type { TelegramQueue } from "../lib/telegram-queue.js";
import type { OpencodeClient } from "../lib/types.js";
import type { SessionStore } from "../session-store.js";

export interface CommandDeps {
  bot: TelegramBotManager;
  config: Config;
  client: OpencodeClient;
  logger: Logger;
  globalStateStore: GlobalStateStore;
  queue: TelegramQueue;
  sessionStore: SessionStore;
}
