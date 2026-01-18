import type { EventHandlerContext } from "./types.js";

export async function handleSessionUpdated(
  event: any,
  context: EventHandlerContext,
): Promise<void> {
  // Safely access the title from the nested property path
  const title = event?.properties?.info?.title;
  const sessionId = event?.properties?.info?.id;

  if (title && sessionId && context.sessionStore) {
    context.sessionStore.setTitle(sessionId, title);
    console.log(`[TelegramRemote] Session title updated: ${sessionId.slice(0, 8)} -> ${title}`);
  }

  if (title && context.globalStateStore) {
    context.globalStateStore.setCurrentSessionTitle(title);
    console.log(`[TelegramRemote] Current session title updated: ${title}`);
  }
}
