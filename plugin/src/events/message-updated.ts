import { createLogger } from "../lib/logger.js";
import type { EventHandlerContext } from "./types.js";

export async function handleMessageUpdated(
    event: any,
    context: EventHandlerContext,
): Promise<void> {
    const logger = createLogger(context.client);
    const message = event.properties.info;
    console.log(`[TelegramRemote] Message updated: ${message.id}, role: ${message.role}`);

    if (message.role === "user") {
        context.messageTracker.markAsUser(message.id);
    } else if (message.role === "assistant") {
        context.messageTracker.markAsAssistant(message.id);

        // Link the prompt message ID to this assistant message
        const topicId = context.sessionStore.getTopicBySession(message.sessionID);
        if (topicId) {
            const promptMessageId = context.sessionStore.getPromptMessageId(topicId);
            if (promptMessageId) {
                context.messageTracker.setStatusMessageId(message.id, promptMessageId);
                context.messageTracker.setProcessingPrompt(message.id, true);
                context.sessionStore.clearPromptMessageId(topicId); // Clear it so it's not reused
                console.log(
                    `[TelegramRemote] Linked prompt message ${promptMessageId} to assistant message ${message.id}`,
                );
            }
        }

        // Check if message is completed
        if (message.time?.completed) {
            // Stop processing and clean up interval
            context.messageTracker.setProcessingPrompt(message.id, false);
            context.messageTracker.clearUpdateInterval(message.id);

            const content = context.messageTracker.getContent(message.id);
            if (content) {
                const lines = content.split("\n");
                if (lines.length > 100) {
                    const topicId = context.sessionStore.getTopicBySession(message.sessionID);
                    if (topicId) {
                        console.log(
                            `[TelegramRemote] Message ${message.id} completed with ${lines.length} lines. Sending as Markdown file.`,
                        );
                        try {
                            await context.bot.sendDocument(topicId, content, "response.md");
                        } catch (error) {
                            console.error("[TelegramRemote] Failed to send document:", error);
                            logger.error("Failed to send document", { error: String(error) });
                        }
                    }
                }
                // Clean up all tracking for this message
                context.messageTracker.clearAllTracking(message.id);
            }
        }
    }
}
