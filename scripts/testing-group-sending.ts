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

async function testTelegramTopic() {
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

    try {
      const chat = await bot.api.getChat(chatId);
      console.log(`✅ Bot can access the chat: ${"title" in chat ? chat.title : chat.first_name}`);

      const messageText = `🧪 Direct message test sent at ${new Date().toLocaleString()}`;
      console.log("Sending test message to direct chat...");
      const sentMessage = await bot.api.sendMessage(chatId, messageText);
      const messageId = sentMessage.message_id;

      console.log("✅ Test message sent successfully");

      console.log("Waiting 5 seconds before cleanup...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log(`Deleting test message (ID: ${messageId})...`);
      await bot.api.deleteMessage(chatId, messageId);

      console.log("✅ Cleanup completed successfully");
    } catch (error) {
      console.error(`❌ Failed to send message or cleanup: ${error}`);
      throw error;
    }

    console.log("Sending test result to direct chat...");
    await bot.api.sendMessage(chatId, "✅ Telegram bot test completed successfully!");
    console.log("✅ Test result sent to direct chat");

    // Stop the bot gracefully
    await bot.stop();
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testTelegramTopic().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
