/**
 * OpenCode Telegram Notification Plugin
 * https://github.com/Davasny/opencode-telegram-notification-plugin
 */

// src/lib/config.ts
var INSTALL_KEY = "__INSTALL_KEY__";
var WORKER_URL = "__WORKER_URL__";
var SERVICE_NAME = "TelegramNotify";
function isConfigured() {
  return !INSTALL_KEY.startsWith("__") && !WORKER_URL.startsWith("__");
}

// src/features/session/utils/get-session-info.ts
async function getSessionInfo(client, logger, sessionId) {
  try {
    const session = await client.session.get({
      path: { id: sessionId }
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
      `Last user message for session ${sessionId}: created=${lastUserMessage?.info.time.created}, completed=${lastUserMessage?.info.role === "assistant" ? lastUserMessage.info.time.completed : void 0}`
    );
    logger.debug("Session details", { session: session.data });
    const lastMessageTime = lastUserMessage?.info.time.created;
    let durationMs;
    if (lastMessageTime) {
      durationMs = Date.now() - lastMessageTime;
      logger.debug(`Session duration: ${durationMs}ms`);
    }
    return {
      title: session.data.title,
      durationMs
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    logger.error(`Error getting session info: ${errorMessage}`, { stack: errorStack });
    return null;
  }
}

// src/features/notify/service.ts
async function sendNotification(client, logger, projectName, sessionId) {
  try {
    logger.debug("Session ID from event", { sessionId });
    const sessionInfo = await getSessionInfo(client, logger, sessionId);
    const payload = {
      key: INSTALL_KEY,
      project: projectName,
      sessionTitle: sessionInfo?.title,
      durationMs: sessionInfo?.durationMs
    };
    logger.debug("Sending payload", { payload });
    const response = await fetch(`${WORKER_URL}/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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

// src/lib/logger.ts
function log(client, level, message, extra) {
  client.app.log({
    body: {
      service: SERVICE_NAME,
      level,
      message,
      extra
    }
  }).catch(() => {
  });
}
function createLogger(client) {
  return {
    debug: (message, extra) => log(client, "debug", message, extra),
    info: (message, extra) => log(client, "info", message, extra),
    warn: (message, extra) => log(client, "warn", message, extra),
    error: (message, extra) => log(client, "error", message, extra)
  };
}

// src/lib/utils.ts
function extractProjectName(directory) {
  if (directory) {
    return directory.split("/").pop() || "Unknown";
  }
  return "Unknown";
}

// src/telegram-notify.ts
var TelegramNotify = async ({ client, directory }) => {
  const logger = createLogger(client);
  if (!isConfigured()) {
    logger.error("Plugin not configured. Please replace INSTALL_KEY and WORKER_URL placeholders.");
    return {
      event: async () => {
      }
    };
  }
  const projectName = extractProjectName(directory);
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await sendNotification(client, logger, projectName, event.properties.sessionID);
      }
    }
  };
};
export {
  TelegramNotify
};
