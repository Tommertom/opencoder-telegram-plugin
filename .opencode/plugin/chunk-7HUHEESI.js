/**
 * OpenCoder Telegram Remote Plugin
 * https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin
 */

// src/config.ts
import { resolve } from "path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: resolve(process.cwd(), ".env") });
function parseAllowedUserIds(value) {
  if (!value || value.trim() === "") {
    return [];
  }
  return value.split(",").map((id) => id.trim()).filter((id) => id !== "").map((id) => Number.parseInt(id, 10)).filter((id) => !Number.isNaN(id));
}
function loadConfig() {
  console.log("[Config] Loading environment configuration...");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
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
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)"
    );
  }
  const audioApiKey = process.env.AUDIO_TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  let audioProvider = null;
  if (audioApiKey) {
    audioProvider = audioApiKey.startsWith("sk-") ? "openai" : "gemini";
    console.log(`[Config] Audio transcription enabled with ${audioProvider}`);
  } else {
    console.log("[Config] Audio transcription disabled (no API key)");
  }
  const finalMessageLineLimitEnv = process.env.TELEGRAM_FINAL_MESSAGE_LINE_LIMIT;
  let finalMessageLineLimit = 100;
  if (finalMessageLineLimitEnv && finalMessageLineLimitEnv.trim() !== "") {
    const parsed = Number.parseInt(finalMessageLineLimitEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      finalMessageLineLimit = parsed;
    } else {
      console.warn("[Config] Invalid TELEGRAM_FINAL_MESSAGE_LINE_LIMIT, using default 100");
    }
  }
  const stepUpdateIntervalEnv = process.env.TELEGRAM_STEP_UPDATE_INTERVAL_MS;
  let stepUpdateIntervalMs = 500;
  if (stepUpdateIntervalEnv && stepUpdateIntervalEnv.trim() !== "") {
    const parsed = Number.parseInt(stepUpdateIntervalEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      stepUpdateIntervalMs = parsed;
    } else {
      console.warn("[Config] Invalid TELEGRAM_STEP_UPDATE_INTERVAL_MS, using default 500");
    }
  }
  console.log(
    `[Config] Configuration loaded: groupId=${parsedGroupId}, allowedUsers=${allowedUserIds.length}, finalMessageLineLimit=${finalMessageLineLimit}, stepUpdateIntervalMs=${stepUpdateIntervalMs}`
  );
  return {
    botToken,
    groupId: parsedGroupId,
    allowedUserIds,
    finalMessageLineLimit,
    stepUpdateIntervalMs,
    audioTranscriptionApiKey: audioApiKey,
    audioTranscriptionProvider: audioProvider
  };
}

export {
  loadConfig
};
