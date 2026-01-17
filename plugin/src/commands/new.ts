import type { Context } from "grammy";
import { getDefaultKeyboardOptions } from "../lib/utils.js";
import type { CommandDeps } from "./types.js";

export function createNewCommandHandler({
  bot,
  config,
  client,
  logger,
  sessionStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /new command received");
    if (ctx.chat?.id !== config.groupId) return;

    try {
      const createSessionResponse = await client.session.create({ body: {} });
      if (createSessionResponse.error) {
        logger.error("Failed to create session", { error: createSessionResponse.error });
        await ctx.reply("❌ Failed to create session", getDefaultKeyboardOptions());
        return;
      }

      const sessionId = createSessionResponse.data.id;
      sessionStore.setActiveSession(sessionId);

      logger.info("Created new session", {
        sessionId,
      });

      await bot.sendMessage(`✅ Session created: ${sessionId}`);
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await ctx.reply("❌ Failed to create session", getDefaultKeyboardOptions());
    }
  };
}
