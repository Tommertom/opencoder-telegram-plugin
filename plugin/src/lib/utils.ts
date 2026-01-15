import type { Bot } from "grammy";
import type { TelegramQueue } from "./telegram-queue.js";

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
): Promise<void> {
  try {
    const sendFn = () => bot.api.sendMessage(chatId, text);
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
