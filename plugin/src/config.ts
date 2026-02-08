import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: resolve(__dirname, "..", "..", ".env") });
loadEnv({ path: resolve(__dirname, "..", ".env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

export const SERVICE_NAME = "TelegramRemote";

export interface Config {
  botToken: string;
  allowedUserIds: number[];
  chatId?: number;
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
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
  const chatIdStr = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || botToken.trim() === "") {
    console.error("[Config] Missing TELEGRAM_BOT_TOKEN");
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }

  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    console.error("[Config] Missing or invalid TELEGRAM_ALLOWED_USER_IDS");
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)",
    );
  }

  // Parse optional chat_id
  let chatId: number | undefined;
  if (chatIdStr && chatIdStr.trim() !== "") {
    const parsed = Number.parseInt(chatIdStr.trim(), 10);
    if (!Number.isNaN(parsed)) {
      chatId = parsed;
      console.log(`[Config] Chat ID configured: ${chatId}`);
    } else {
      console.warn(`[Config] Invalid TELEGRAM_CHAT_ID: ${chatIdStr}`);
    }
  }

  console.log(
    `[Config] Configuration loaded: allowedUsers=${allowedUserIds.length}`,
  );

  return {
    botToken,
    allowedUserIds,
    chatId,
  };
}
