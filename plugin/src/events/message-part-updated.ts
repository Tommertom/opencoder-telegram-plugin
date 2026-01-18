import { createLogger } from "../lib/logger.js";
import type { EventHandlerContext } from "./types.js";

export async function handleMessagePartUpdated(
  event: any,
  context: EventHandlerContext,
): Promise<void> {
  const _logger = createLogger(context.client);
  const part = event.properties.part;

  if (part.type === "text") {
    const text = part.text;
    context.globalStateStore.setLastMessagePartUpdate(text);
    // console.log(`[TelegramRemote] Message part updated: ${text.substring(0, 50)}...`);
  }
}
