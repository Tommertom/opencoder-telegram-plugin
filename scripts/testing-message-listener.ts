#!/usr/bin/env node

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Bot } from "grammy";

// Load environment variables from .env in project root
const scriptDir = resolve(import.meta.url.replace("file://", ""), "..");
const projectRoot = resolve(scriptDir, "..");
loadEnv({ path: resolve(projectRoot, ".env") });

interface Config {
  botToken: string;
  allowedUserIds: number[];
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

function loadConfig(): Config {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;

  if (!botToken || botToken.trim() === "") {
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }

  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)",
    );
  }

  return {
    botToken,
    allowedUserIds,
  };
}

async function testMessageListener() {
  try {
    console.log("Loading configuration...");
    const config = loadConfig();

    console.log(`Bot Token: ${config.botToken.substring(0, 10)}...`);
    console.log(`Allowed User IDs: ${config.allowedUserIds.join(", ")}`);

    const chatId = config.allowedUserIds[0];
    if (!chatId) {
      throw new Error("No allowed user IDs available for direct message testing.");
    }
    console.log(`Chat ID: ${chatId}`);

    console.log("Initializing Telegram bot...");
    const bot = new Bot(config.botToken);

    console.log("Checking bot access to the direct chat...");
    try {
      const chat = await bot.api.getChat(chatId);
      console.log(`✅ Bot can access the chat: ${"title" in chat ? chat.title : chat.first_name}`);
      console.log("✅ Message listener test passed");
    } catch (error) {
      console.error(`❌ Failed to access the chat: ${error}`);
      throw error;
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testMessageListener().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
