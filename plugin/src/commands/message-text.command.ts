import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createMessageTextHandler({
  config,
  client,
  logger,
  sessionStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log(`[Bot] Text message received: "${ctx.message?.text?.slice(0, 50)}..."`);
    if (ctx.chat?.id !== config.groupId) return;
    if (ctx.message?.text?.startsWith("/")) return;

    const topicId = ctx.message?.message_thread_id;
    console.log(`[Bot] Message in topic: ${topicId}`);
    if (!topicId) {
      const userMessage = ctx.message?.text;
      await ctx.reply(`Nothing I can do with this ${userMessage}`);
      return;
    }

    let sessionId = sessionStore.getSessionByTopic(topicId);

    if (!sessionId) {
      try {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await ctx.reply("❌ Failed to initialize session");
          return;
        }

        sessionId = createSessionResponse.data.id;
        sessionStore.create(topicId, sessionId);

        logger.info("Auto-created session for existing topic", {
          sessionId,
          topicId,
        });
      } catch (error) {
        logger.error("Failed to create session", { error: String(error) });
        await ctx.reply("❌ Failed to initialize session");
        return;
      }
    }

    const userMessage = ctx.message?.text;

    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: userMessage || "" }],
        },
      });

      if (response.error) {
        logger.error("Failed to send message to OpenCode", {
          error: response.error,
          sessionId,
        });
        await ctx.reply("❌ Failed to process message");
        return;
      }

      logger.debug("Forwarded message to OpenCode", {
        sessionId,
        topicId,
      });
    } catch (error) {
      logger.error("Failed to send message to OpenCode", {
        error: String(error),
        sessionId,
      });
      await ctx.reply("❌ Failed to process message");
    }
  };
}
