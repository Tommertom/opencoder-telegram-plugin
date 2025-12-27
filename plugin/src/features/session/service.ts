import type { Session } from "@opencode-ai/sdk";
import type { Logger } from "../../lib/logger";
import type { OpencodeClient } from "../../lib/types";

export async function getSessionById(
  client: OpencodeClient,
  logger: Logger,
  sessionId: string,
): Promise<Session | null> {
  const response = await client.session.get({
    path: { id: sessionId },
  });

  if (response.error) {
    logger.error(`Error getting session: ${JSON.stringify(response.error)}`);
    return null;
  }

  logger.debug("Session details", { session: response.data });
  return response.data;
}

export async function getLatestSession(
  client: OpencodeClient,
  logger: Logger,
): Promise<Session | null> {
  const listResponse = await client.session.list();

  if (listResponse.error) {
    logger.error(`Error listing sessions: ${JSON.stringify(listResponse.error)}`);
    return null;
  }

  logger.debug("Sessions list", { count: listResponse.data?.length });

  const sessions = listResponse.data;
  if (!sessions || sessions.length === 0) {
    return null;
  }

  const latestSession = sessions[0];
  return getSessionById(client, logger, latestSession.id);
}

export async function getSessionInfo(
  client: OpencodeClient,
  logger: Logger,
  sessionId: string | undefined,
): Promise<Session | null> {
  try {
    if (sessionId) {
      return getSessionById(client, logger, sessionId);
    }
    return getLatestSession(client, logger);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    logger.error(`Error getting session info: ${errorMessage}`, { stack: errorStack });
    return null;
  }
}
