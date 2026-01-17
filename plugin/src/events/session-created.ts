import type { EventHandlerContext } from "./types.js";

export async function handleSessionCreated(
  event: any,
  context: EventHandlerContext,
): Promise<void> {
  const sessionId = event.properties.info.id;
  console.log(`[TelegramRemote] Session created: ${sessionId.slice(0, 8)}`);

  const message = await context.bot.sendMessage(`✅ Session initialized: ${sessionId.slice(0, 8)}`);
  context.sessionStore.setSessionInitializedMessageId(message.message_id);
}
