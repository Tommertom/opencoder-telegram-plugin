import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createDeleteSessionsCommandHandler({
  bot,
  config,
  client,
  logger,
  sessionStore,
  queue,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /deletesessions command received");
    if (ctx.chat?.id !== config.groupId) return;

    let deletedSessions = 0;
    let failedSessions = 0;

    try {
      const sessionsResponse = await client.session.list();

      if (sessionsResponse.error) {
        logger.error("Failed to list sessions", { error: sessionsResponse.error });
        await ctx.reply("❌ Failed to list sessions");
        return;
      }

      const sessions = sessionsResponse.data || [];

      for (const session of sessions) {
        try {
          const deleteResponse = await client.session.delete({
            path: { id: session.id },
          });

          if (deleteResponse.error) {
            failedSessions += 1;
            logger.error("Failed to delete session", {
              sessionId: session.id,
              error: deleteResponse.error,
            });
            continue;
          }

          deletedSessions += 1;
        } catch (error) {
          failedSessions += 1;
          logger.error("Failed to delete session", {
            sessionId: session.id,
            error: String(error),
          });
        }
      }
    } catch (error) {
      logger.error("Failed to delete sessions", { error: String(error) });
      await ctx.reply("❌ Failed to delete sessions");
      return;
    }

    const topicIds = sessionStore.getAllTopicIds().filter((topicId) => topicId !== 1);
    let deletedTopics = 0;
    let failedTopics = 0;

    for (const topicId of topicIds) {
      try {
        await queue.enqueue(() => bot.api.deleteForumTopic(config.groupId, topicId));
        deletedTopics += 1;
      } catch (error) {
        failedTopics += 1;
        logger.error("Failed to delete forum topic", {
          topicId,
          error: String(error),
        });
      }
    }

    sessionStore.clearAll();

    await ctx.reply(
      `Deleted ${deletedSessions} sessions (${failedSessions} failed). ` +
        `Cleared ${deletedTopics} topics (${failedTopics} failed).`,
    );
  };
}
