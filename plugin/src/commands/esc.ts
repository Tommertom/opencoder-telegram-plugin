import type { Context } from "grammy";
import { getDefaultKeyboardOptions } from "../lib/utils.js";
import type { CommandDeps } from "./types.js";

export function createEscCommandHandler({ config, client, logger, globalStateStore }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /esc command received");
    if (ctx.chat?.type !== "private") return;

    // Enforce authorization explicitly so middleware cannot be bypassed
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /esc attempt by unauthorized user ${userId}`);
      await ctx.reply("You are not authorized to use this bot.", getDefaultKeyboardOptions());
      return;
    }

    const sessionId = globalStateStore.getActiveSession();

    if (!sessionId) {
      await ctx.reply("❌ No active session. Use /new to create one.", getDefaultKeyboardOptions());
      return;
    }

    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: "\x1b" }],
        },
      });

      if (response.error) {
        logger.error("Failed to send escape to OpenCode", {
          error: response.error,
          sessionId,
        });
        await ctx.reply("❌ Failed to send escape", getDefaultKeyboardOptions());
        return;
      }

      logger.debug("Sent escape to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Failed to send escape to OpenCode", {
        error: String(error),
        sessionId,
      });
      await ctx.reply("❌ Failed to send escape", getDefaultKeyboardOptions());
    }
  };
}
