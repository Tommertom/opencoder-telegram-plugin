import type { EventHandlerContext } from "./types.js";

export async function handleSessionUpdated(
  event: any,
  context: EventHandlerContext,
): Promise<void> {
  // Safely access the title from the nested property path
  const title = event?.properties?.info?.title;
  
  if (title && context.globalStateStore) {
    context.globalStateStore.setCurrentSessionTitle(title);
    console.log(`[TelegramRemote] Session title updated: ${title}`);
  }
}
