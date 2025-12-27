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

// src/lib/utils.ts
function extractProjectName(directory) {
  if (directory) {
    return directory.split("/").pop() || "Unknown";
  }
  return "Unknown";
}
function calculateDurationSeconds(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) {
    return null;
  }
  return Math.round((updatedAt - createdAt) / 1e3);
}

// src/features/session/service.ts
async function getSessionById(client, logger, sessionId) {
  const response = await client.session.get({
    path: { id: sessionId }
  });
  if (response.error) {
    logger.error(`Error getting session: ${JSON.stringify(response.error)}`);
    return null;
  }
  logger.debug("Session details", { session: response.data });
  return response.data;
}
async function getLatestSession(client, logger) {
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
async function getSessionInfo(client, logger, sessionId) {
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

// src/features/notify/service.ts
async function sendNotification(client, logger, projectName, sessionId) {
  try {
    logger.debug("Session ID from event", { sessionId });
    const sessionInfo = await getSessionInfo(client, logger, sessionId);
    const payload = {
      key: INSTALL_KEY,
      project: projectName
    };
    if (sessionInfo) {
      if (sessionInfo.title) {
        payload.sessionTitle = sessionInfo.title;
      }
      const durationSeconds = calculateDurationSeconds(
        sessionInfo.time?.created,
        sessionInfo.time?.updated
      );
      if (durationSeconds !== null) {
        payload.durationSeconds = durationSeconds;
      }
    }
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

// src/telegram-notify.ts
function isSessionIdleEvent(event) {
  return event.type === "session.idle";
}
var TelegramNotify = async ({ client, directory }) => {
  const logger = createLogger(client);
  if (!isConfigured()) {
    await logger.error(
      "Plugin not configured. Please replace INSTALL_KEY and WORKER_URL placeholders."
    );
    return {
      event: async () => {
      }
    };
  }
  const projectName = extractProjectName(directory);
  return {
    event: async ({ event }) => {
      if (isSessionIdleEvent(event)) {
        await sendNotification(client, logger, projectName, event.properties.sessionID);
      }
    }
  };
};
export {
  TelegramNotify
};
