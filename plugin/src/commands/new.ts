import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createNewCommandHandler({
  bot,
  config,
  client,
  logger,
  sessionStore,
  queue,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /new command received");
    if (ctx.chat?.id !== config.groupId) return;

    try {
      const createSessionResponse = await client.session.create({ body: {} });
      if (createSessionResponse.error) {
        logger.error("Failed to create session", { error: createSessionResponse.error });
        await ctx.reply("❌ Failed to create session");
        return;
      }

      const sessionId = createSessionResponse.data.id;
      const sessionTitle = createSessionResponse.data.title || `Session ${sessionId.slice(0, 8)}`;
      const topicName =
        sessionTitle.length > 100 ? `${sessionTitle.slice(0, 97)}...` : sessionTitle;

      const topic = await queue.enqueue(() => bot.api.createForumTopic(config.groupId, topicName));
      const topicId = topic.message_thread_id;

      sessionStore.create(topicId, sessionId);

      logger.info("Created new session with topic", {
        sessionId,
        topicId,
        topicName,
      });

      await queue.enqueue(() =>
        bot.api.sendMessage(config.groupId, `✅ Session created: ${sessionId}`, {
          message_thread_id: topicId,
        }),
      );
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await ctx.reply("❌ Failed to create session");
    }
  };
}
