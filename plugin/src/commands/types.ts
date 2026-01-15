import type { Bot } from "grammy";
import type { Config } from "../config.js";
import type { Logger } from "../lib/logger.js";
import type { TelegramQueue } from "../lib/telegram-queue.js";
import type { OpencodeClient } from "../lib/types.js";
import type { SessionStore } from "../session-store.js";

export interface CommandDeps {
  bot: Bot;
  config: Config;
  client: OpencodeClient;
  logger: Logger;
  sessionStore: SessionStore;
  queue: TelegramQueue;
}
