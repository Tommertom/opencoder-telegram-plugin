import type { EventHandlerContext } from "./types.js";

export async function handleSessionCreated(
    event: any,
    context: EventHandlerContext,
): Promise<void> {
    const sessionId = event.properties.info.id;
    const topicId = context.sessionStore.getTopicBySession(sessionId);
    console.log(`[TelegramRemote] Session created: ${sessionId.slice(0, 8)}, topicId: ${topicId}`);

    if (topicId) {
        await context.bot.sendMessage(topicId, `✅ Session initialized: ${sessionId.slice(0, 8)}`);
    }
}
