import { createLogger } from "../lib/logger.js";
import type { EventHandlerContext } from "./types.js";

export async function handleMessagePartUpdated(
  event: any,
  context: EventHandlerContext,
): Promise<void> {
  const logger = createLogger(context.client);
  const part = event.properties.part;

  if (part.type === "text") {
    const text = part.text;
    context.globalStateStore.setLastMessagePartUpdate(text);

    // If this event contains a delta payload, update the per-session lastUpdate and lastUpdateDelta maps
    if (typeof event.properties.delta !== "undefined" && event.properties.delta !== null) {
      if (part.sessionID) {
        try {
          context.globalStateStore.setLastUpdate(part.sessionID, text);
          context.globalStateStore.setLastUpdateDelta(part.sessionID, event.properties.delta);
          logger.info("Stored lastUpdate and lastUpdateDelta", { sessionID: part.sessionID, delta: event.properties.delta });
        } catch (err) {
          logger.warn("Failed to store last update data", { error: String(err) });
        }
      } else {
        logger.warn("Delta message received but missing sessionID");
      }
    }

    // If this part includes an end time, the message part is complete — send it to Telegram
    if (part.time && typeof part.time.end !== "undefined" && part.time.end !== null) {
      try {
        // Use central config to decide whether to send as message or markdown file
        const { loadConfig } = await import("../config.js");
        const cfg = loadConfig();
        const lineCount = text.split(/\r?\n/).length;

        if (lineCount > cfg.finalMessageLineLimit) {
          await context.bot.sendDocument(text, "response.md");
        } else {
          await context.bot.sendMessage(text);
        }

        // Store the sent message in global state keyed by sessionID
        if (part.sessionID) {
          try {
            context.globalStateStore.setLastSendFinalMessage(part.sessionID, text);
            logger.info("Stored lastSendFinalMessage", { sessionID: part.sessionID });
          } catch (err) {
            logger.warn("Failed to store lastSendFinalMessage", { error: String(err) });
          }
        }

        logger.info("Message part sent to Telegram", { text: text.substring(0, 100) });
      } catch (error) {
        logger.error("Failed to send message part to Telegram", { error: String(error) });
      }
    }

    // console.log(`[TelegramRemote] Message part updated: ${text.substring(0, 50)}...`);
  }
}
