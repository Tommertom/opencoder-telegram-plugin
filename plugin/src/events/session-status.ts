import type { EventHandlerContext } from "./types.js";

export async function handleSessionStatus(event: any, context: EventHandlerContext): Promise<void> {
  // Safely access the status type from the nested property path
  const statusType = event?.properties?.status?.type;

  if (statusType && context.globalStateStore) {
    context.globalStateStore.setSessionStatus(statusType);
    console.log(`[TelegramRemote] Session status updated: ${statusType}`);

    // If the session becomes idle, tell the user the agent has finished
    if (statusType === "idle") {
      console.log(`[TelegramRemote] Session is idle. Sending finished notification.`);
      try {
        await context.bot.sendTemporaryMessage("Agent has finished.");
      } catch (error) {
        console.error("[TelegramRemote] Failed to send idle notification:", error);
      }
    }

    if (statusType === "completed") {
      // Find the last assistant message and send it
      const lastResponse = context.globalStateStore.getLastResponse();

      // Check if we already sent this exact content to avoid duplicates
      const lastSent = context.globalStateStore.getLastResponseSentContent();

      if (lastResponse && lastResponse !== lastSent) {
        console.log(`[TelegramRemote] Session completed. Sending final response.`);

        // Mark as sent
        context.globalStateStore.setLastResponseSentContent(lastResponse);

        try {
          const lines = lastResponse.split("\n");
          if (lines.length > 100) {
            await context.bot.sendDocument(lastResponse, "response.md");
          } else {
            await context.bot.sendMessage('Final' + lastResponse);
          }
        } catch (error) {
          console.error("[TelegramRemote] Failed to send final response:", error);
        }
      } else if (!lastResponse) {
        console.log(`[TelegramRemote] Session completed but no last response found.`);
        await context.bot.sendTemporaryMessage("Task completed.");
      } else {
        console.log(`[TelegramRemote] Session completed. Last response already sent.`);
      }
    }
  }
}
