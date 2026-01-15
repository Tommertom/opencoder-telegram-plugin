import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env") });

export interface Config {
  botToken: string;
  groupId: number;
  allowedUserIds: number[];
  maxSessions: number;
}

function parseAllowedUserIds(value: string | undefined): number[] {
  if (!value || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "")
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => !Number.isNaN(id));
}

export function loadConfig(): Config {
  console.log("[Config] Loading environment configuration...");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
  const maxSessionsStr = process.env.TELEGRAM_MAX_SESSIONS;

  if (!botToken || botToken.trim() === "") {
    console.error("[Config] Missing TELEGRAM_BOT_TOKEN");
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }

  if (!groupId || groupId.trim() === "") {
    console.error("[Config] Missing TELEGRAM_GROUP_ID");
    throw new Error("Missing required environment variable: TELEGRAM_GROUP_ID");
  }

  const parsedGroupId = Number.parseInt(groupId, 10);
  if (Number.isNaN(parsedGroupId)) {
    console.error("[Config] Invalid TELEGRAM_GROUP_ID (not a number)");
    throw new Error("TELEGRAM_GROUP_ID must be a valid number");
  }

  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    console.error("[Config] Missing or invalid TELEGRAM_ALLOWED_USER_IDS");
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)",
    );
  }

  // Parse maxSessions with default value of 5
  let maxSessions = 5;
  if (maxSessionsStr && maxSessionsStr.trim() !== "") {
    const parsed = Number.parseInt(maxSessionsStr, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      maxSessions = parsed;
    } else {
      console.warn(`[Config] Invalid TELEGRAM_MAX_SESSIONS (${maxSessionsStr}), using default: 5`);
    }
  }

  console.log(
    `[Config] Configuration loaded: groupId=${parsedGroupId}, allowedUsers=${allowedUserIds.length}, maxSessions=${maxSessions}`,
  );

  return {
    botToken,
    groupId: parsedGroupId,
    allowedUserIds,
    maxSessions,
  };
}
