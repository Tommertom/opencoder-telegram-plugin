import { INSTALL_KEY, WORKER_URL } from "../../lib/config";
import type { Logger } from "../../lib/logger";
import type { OpencodeClient } from "../../lib/types";
import { getSessionInfo } from "../session/service";
import type { NotifyPayload } from "./types";

export async function sendNotification(
  client: OpencodeClient,
  logger: Logger,
  projectName: string,
  sessionId: string | undefined,
): Promise<void> {
  try {
    logger.debug("Session ID from event", { sessionId });

    const sessionInfo = await getSessionInfo(client, logger, sessionId);

    const payload: NotifyPayload = {
      key: INSTALL_KEY,
      project: projectName,
    };

    if (sessionInfo?.title) {
      payload.sessionTitle = sessionInfo.title;
    }

    logger.debug("Sending payload", { payload });

    const response = await fetch(`${WORKER_URL}/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error(`Failed to send notification: ${response.status} ${response.statusText}`);
    } else {
      logger.info("Notification sent successfully");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    logger.error(`Error sending notification: ${errorMessage}`, { stack: errorStack });
  }
}
