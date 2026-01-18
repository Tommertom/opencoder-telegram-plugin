import type { EventHandlerContext } from "./types.js";

export async function handleSessionCreated(
  event: any,
  context: EventHandlerContext,
): Promise<void> {
  const sessionId = event.properties.info.id;
  const sessionTitle = event.properties.info.title || sessionId;
  console.log(`[TelegramRemote] Session created: ${sessionId.slice(0, 8)}`);

  context.globalStateStore.setActiveSession(sessionId);
  context.sessionStore.setTitle(sessionId, sessionTitle);

  await context.bot.sendTemporaryMessage(
    `✅ Session initialized: ${sessionTitle.slice(0, 50)}`,
    10000,
  );
}
