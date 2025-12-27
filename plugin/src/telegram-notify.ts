import type { Plugin } from "@opencode-ai/plugin";
import type { EventSessionIdle } from "@opencode-ai/sdk";
import { sendNotification } from "./features/notify/service";
import { isConfigured } from "./lib/config";
import { createLogger } from "./lib/logger";
import { extractProjectName } from "./lib/utils";

function isSessionIdleEvent(event: { type: string }): event is EventSessionIdle {
  return event.type === "session.idle";
}

export const TelegramNotify: Plugin = async ({ client, directory }) => {
  const logger = createLogger(client);

  if (!isConfigured()) {
    logger.error(
      "Plugin not configured. Please replace INSTALL_KEY and WORKER_URL placeholders.",
    );
    return {
      event: async () => {},
    };
  }

  const projectName = extractProjectName(directory);

  return {
    event: async ({ event }) => {
      if (isSessionIdleEvent(event)) {
        await sendNotification(client, logger, projectName, event.properties.sessionID);
      }
    },
  };
};
