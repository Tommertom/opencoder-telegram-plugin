import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bot } from "grammy";
import { createDefaultKeyboard } from "./keyboard.js";
import type { TelegramQueue } from "./telegram-queue.js";

/**
 * Writes an event to a JSON file in the /debug folder for debugging purposes
 * @param event - The event object to write
 * @param overwrite - If true, overwrites existing file. If false, prepends Unix epoch to filename (default: false)
 * @param excludeEvents - Array of event types that should not be written to debug files (default: [])
 */
export function writeEventToDebugFile(
  event: { type: string; [key: string]: unknown },
  overwrite: boolean = false,
  excludeEvents: string[] = [],
): void {
  // Skip writing if event type is in the exclusion list
  if (excludeEvents.includes(event.type)) {
    return;
  }

  try {
    const debugDir = join(process.cwd(), "debug");
    mkdirSync(debugDir, { recursive: true });
    const filename = overwrite ? `${event.type}.json` : `${Date.now()}.${event.type}.json`;
    const filepath = join(debugDir, filename);
    writeFileSync(filepath, JSON.stringify(event, null, 2), { flag: "w" });
  } catch (error) {
    console.error(`[TelegramRemote] Failed to write event to file:`, error);
  }
}

/**
 * Sends a temporary message that automatically deletes itself after the specified duration
 * @param bot - The Telegram bot instance
 * @param chatId - The chat ID to send the message to
 * @param text - The message text
 * @param durationMs - Duration in milliseconds before deleting the message (default: 10000ms = 10 seconds)
 * @param queue - Optional TelegramQueue for rate limiting
 */
export async function sendTemporaryMessage(
  bot: Bot,
  chatId: number,
  text: string,
  durationMs: number = 1000,
  queue?: TelegramQueue,
  options?: Parameters<Bot["api"]["sendMessage"]>[2],
): Promise<void> {
  try {
    const sendFn = () => bot.api.sendMessage(chatId, text, options);
    const sentMessage = queue ? await queue.enqueue(sendFn) : await sendFn();
    const messageId = sentMessage.message_id;

    setTimeout(async () => {
      try {
        const deleteFn = () => bot.api.deleteMessage(chatId, messageId);
        if (queue) {
          await queue.enqueue(deleteFn);
        } else {
          await deleteFn();
        }
      } catch (error) {
        // Message might have already been deleted or bot might not have permission
        console.warn("Failed to delete temporary message", { error: String(error), messageId });
      }
    }, durationMs);
  } catch (error) {
    console.error("Failed to send temporary message", { error: String(error) });
  }
}

/**
 * Gets the default reply keyboard options with Tab and Esc buttons
 */
export function getDefaultKeyboardOptions() {
  return {
    reply_markup: createDefaultKeyboard(),
  };
}
