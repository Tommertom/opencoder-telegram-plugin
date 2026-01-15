import { createLogger } from "../lib/logger.js";
import type { EventHandlerContext } from "./types.js";

const MAX_MESSAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for in-memory message buffering

export async function handleMessagePartUpdated(
    event: any,
    context: EventHandlerContext,
): Promise<void> {
    const logger = createLogger(context.client);
    const part = event.properties.part;

    if (part.type !== "text") {
        return;
    }

    const isAssistantMessage = context.messageTracker.isAssistant(part.messageID);
    if (!isAssistantMessage) {
        return;
    }

    const sessionId = part.sessionID;
    const topicId = context.sessionStore.getTopicBySession(sessionId);

    if (!topicId) {
        logger.debug("No topic found for session", { sessionId });
        return;
    }

    // First, accumulate the delta if present
    const delta = event.properties.delta;
    if (delta) {
        const currentContent = context.messageTracker.getContent(part.messageID) || "";

        if (currentContent.length + delta.length > MAX_MESSAGE_SIZE) {
            console.warn(
                `[TelegramRemote] Message ${part.messageID} exceeded ${MAX_MESSAGE_SIZE} bytes. Truncating.`,
            );
            // Stop accumulating to prevent memory exhaustion
        } else {
            context.messageTracker.updateContent(part.messageID, currentContent + delta);
        }
    }

    // Get the accumulated message text so far (after adding the delta)
    const fullText = context.messageTracker.getContent(part.messageID) || "";

    // Check if this is the first update for this message
    const statusMessageId = context.messageTracker.getStatusMessageId(part.messageID);
    const hasInterval = context.messageTracker.getLatestUpdate(part.messageID) !== undefined;

    if (statusMessageId && !hasInterval) {
        // First update - update the status message with full text and start interval
        console.log(
            `[TelegramRemote] First update for message ${part.messageID}, updating status message`,
        );

        try {
            await context.bot.editMessage(topicId, statusMessageId, fullText || "Processing...");
            context.messageTracker.setLatestUpdate(part.messageID, fullText);

            // Track the last sent text to detect changes
            let lastSentText = fullText;

            // Start interval to check for updates every 500ms
            const updateInterval = setInterval(async () => {
                if (!context.messageTracker.isProcessingPrompt(part.messageID)) {
                    // Stop interval if processing is done
                    console.log(
                        `[TelegramRemote] Processing complete for message ${part.messageID}, stopping interval`,
                    );
                    context.messageTracker.clearUpdateInterval(part.messageID);
                    return;
                }

                // Check if latestUpdate has changed since last send
                const currentLatest = context.messageTracker.getLatestUpdate(part.messageID);
                if (currentLatest && currentLatest !== lastSentText) {
                    // Update the message with the latest text
                    try {
                        await context.bot.editMessage(topicId, statusMessageId, currentLatest);
                        lastSentText = currentLatest;
                        console.log(`[TelegramRemote] Updated status message for ${part.messageID}`);
                    } catch (error) {
                        console.error(`[TelegramRemote] Failed to update status message:`, error);
                    }
                }
            }, 500);

            context.messageTracker.setUpdateInterval(part.messageID, updateInterval);
            console.log(`[TelegramRemote] Started update interval for message ${part.messageID}`);
        } catch (error) {
            console.error(`[TelegramRemote] Failed to update status message:`, error);
        }
    } else if (statusMessageId && hasInterval) {
        // Subsequent update - just update the latestUpdate
        console.log(
            `[TelegramRemote] Subsequent update for message ${part.messageID}, updating latestUpdate`,
        );
        context.messageTracker.setLatestUpdate(part.messageID, fullText);
    }
}
