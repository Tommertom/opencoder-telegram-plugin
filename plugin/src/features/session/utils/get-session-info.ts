import type { Logger } from "../../../lib/logger";
import type { OpencodeClient } from "../../../lib/types";
import type { SessionInfo } from "../types";

export async function getSessionInfo(
  client: OpencodeClient,
  logger: Logger,
  sessionId: string,
): Promise<SessionInfo | null> {
  try {
    const session = await client.session.get({
      path: { id: sessionId },
    });

    if (session.error) {
      logger.error(`Error getting session: ${JSON.stringify(session.error)}`);
      return null;
    }

    const messages = await client.session.messages({ path: { id: sessionId } });
    if (messages.error) {
      logger.error(`Error getting session messages: ${JSON.stringify(messages.error)}`);
      return null;
    }

    const lastUserMessage = [...messages.data].reverse().find((msg) => msg.info.role === "user");

    logger.debug(
      `Last user message for session ${sessionId}: created=${lastUserMessage?.info.time.created}, completed=${lastUserMessage?.info.role === "assistant" ? lastUserMessage.info.time.completed : undefined}`,
    );

    logger.debug("Session details", { session: session.data });

    const lastMessageTime = lastUserMessage?.info.time.created;

    let durationMs: number | undefined;
    if (lastMessageTime) {
      durationMs = Date.now() - lastMessageTime;
      logger.debug(`Session duration: ${durationMs}ms`);
    }

    return {
      title: session.data.title,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";

    logger.error(`Error getting session info: ${errorMessage}`, { stack: errorStack });

    return null;
  }
}
