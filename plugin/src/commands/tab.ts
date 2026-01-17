import type { Context } from "grammy";
import { getDefaultKeyboardOptions } from "../lib/utils.js";
import type { CommandDeps } from "./types.js";

export function createTabCommandHandler({ config, client, logger, sessionStore }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /tab command received");
    if (ctx.chat?.id !== config.groupId) return;

    // Enforce authorization explicitly so middleware cannot be bypassed
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /tab attempt by unauthorized user ${userId}`);
      await ctx.reply("You are not authorized to use this bot.", getDefaultKeyboardOptions());
      return;
    }

    const sessionId = sessionStore.getActiveSession();
    if (!sessionId) {
      await ctx.reply("❌ No active session. Use /new to create one.", getDefaultKeyboardOptions());
      return;
    }

    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: "\t" }],
        },
      });

      if (response.error) {
        logger.error("Failed to send tab to OpenCode", {
          error: response.error,
          sessionId,
        });
        await ctx.reply("❌ Failed to send tab", getDefaultKeyboardOptions());
        return;
      }

      logger.debug("Sent tab to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Failed to send tab to OpenCode", {
        error: String(error),
        sessionId,
      });
      await ctx.reply("❌ Failed to send tab", getDefaultKeyboardOptions());
    }
  };
}
