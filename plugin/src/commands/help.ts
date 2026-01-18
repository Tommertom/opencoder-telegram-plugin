import type { Context } from "grammy";
import { getDefaultKeyboardOptions } from "../lib/utils.js";
import type { CommandDeps } from "./types.js";

export function createHelpCommandHandler({ config }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /help command received");
    if (ctx.chat?.id !== config.groupId) return;

    // Enforce authorization explicitly so middleware cannot be bypassed
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /help attempt by unauthorized user ${userId}`);
      await ctx.reply("You are not authorized to use this bot.");
      return;
    }

    const helpMessage =
      "Available commands:\n" +
      "\n" +
      "/new - Create a new OpenCode session.\n" +
      "/deletesessions - Delete all OpenCode sessions.\n" +
      "/sessions - List all active OpenCode sessions.\n" +
      "/agents - List available agents.\n" +
      "/models - List available models and select one.\n" +
      "/todos - Show current todos.\n" +
      "/tab - Send a Tab key to the active session.\n" +
      "/esc - Send an Escape key to the active session.\n" +
      "/help - Show this help message.\n" +
      "\n" +
      "Usage:\n" +
      "- Use /new to create a new session.\n" +
      "- Use /models to select a model for subsequent prompts.\n" +
      "- Use /todos to list the current todos.\n" +
      "- Send messages in this chat to interact with the active session.\n" +
      "- Send voice messages or audio files (max 25MB) to transcribe and send them as prompts.\n" +
      "- Use Tab and Esc buttons or commands to send special keys.\n" +
      "- Admin-only commands (like /deletesessions) are restricted to configured users.\n" +
      "\n" +
      "Note: All commands require you to be a configured allowed user. The bot enforces this via its middleware and command-level checks.";

    await ctx.reply(helpMessage, getDefaultKeyboardOptions());
  };
}
