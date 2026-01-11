#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { Bot } from "grammy";

// Load environment variables from .env in project root
const scriptDir = resolve(import.meta.url.replace("file://", ""), "..");
const projectRoot = resolve(scriptDir, "..");
loadEnv({ path: resolve(projectRoot, ".env") });

interface Config {
  botToken: string;
  groupId: number;
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
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;

  if (!botToken || botToken.trim() === "") {
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }

  if (!groupId || groupId.trim() === "") {
    throw new Error("Missing required environment variable: TELEGRAM_GROUP_ID");
  }

  const parsedGroupId = Number.parseInt(groupId, 10);
  if (Number.isNaN(parsedGroupId)) {
    throw new Error("TELEGRAM_GROUP_ID must be a valid number");
  }

  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)",
    );
  }

  return {
    botToken,
    groupId: parsedGroupId,
    allowedUserIds,
  };
}

async function testTelegramTopic() {
  try {
    console.log("Loading configuration...");
    const config = loadConfig();

    console.log(`Bot Token: ${config.botToken.substring(0, 10)}...`);
    console.log(`Group ID: ${config.groupId}`);
    console.log(`Allowed User IDs: ${config.allowedUserIds.join(", ")}`);

    // Validate group ID format
    if (config.groupId > 0) {
      console.warn(
        "⚠️  Warning: Group ID is positive. Telegram supergroup IDs are usually negative (like -1001234567890)",
      );
    } else if (!config.groupId.toString().startsWith("-100")) {
      console.warn("⚠️  Warning: Group ID doesn't start with -100. Make sure it's a supergroup ID.");
    }

    console.log("Initializing Telegram bot...");
    const bot = new Bot(config.botToken);

    const testTopicName = `Test Topic ${Date.now()}`;

    console.log(`Creating new test topic: ${testTopicName}...`);

    try {
      const topic = await bot.api.createForumTopic(config.groupId, testTopicName);
      const topicId = topic.message_thread_id;
      console.log(`Created test topic with ID: ${topicId}`);

      // Send test message
      const messageText = `🧪 Test message sent at ${new Date().toLocaleString()}`;
      console.log(`Sending test message to topic ID: ${topicId}...`);
      const sentMessage = await bot.api.sendMessage(config.groupId, messageText, {
        message_thread_id: topicId,
      });
      const messageId = sentMessage.message_id;

      console.log(`✅ Test message sent successfully to topic "${testTopicName}"`);

      // Wait 10 seconds
      console.log("Waiting 10 seconds before cleanup...");
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Delete the message
      console.log(`Deleting test message (ID: ${messageId})...`);
      await bot.api.deleteMessage(config.groupId, messageId);

      // Delete the topic
      console.log(`Deleting test topic (ID: ${topicId})...`);
      await bot.api.deleteForumTopic(config.groupId, topicId);

      console.log("✅ Cleanup completed successfully");
    } catch (error) {
      console.error(`❌ Failed to create topic, send message, or cleanup: ${error}`);
      throw error;
    }

    // Send test result to general channel
    console.log("Sending test result to general channel...");
    await bot.api.sendMessage(config.groupId, "✅ Telegram bot test completed successfully!");
    console.log("✅ Test result sent to general channel");

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
