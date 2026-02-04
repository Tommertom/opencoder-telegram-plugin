import type { EventHandlerContext } from "./types.js";

export async function handleSessionUpdated(
  event: any,
  context: EventHandlerContext,
): Promise<void> {
  const title = event?.properties?.info?.title;
  const sessionId = event?.properties?.info?.id ?? event?.properties?.id;

  if (title && context.sessionTitleService) {
    if (typeof sessionId === "string" && sessionId.trim()) {
      context.sessionTitleService.setSessionTitle(sessionId, title);
    }
  }
}
