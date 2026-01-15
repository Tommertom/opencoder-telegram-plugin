import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createClearTopicsCommandHandler({
  bot,
  config,
  logger,
  sessionStore,
  queue,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /cleartopics command received");
    if (ctx.chat?.id !== config.groupId) return;

    const topicIds = sessionStore.getAllTopicIds().filter((topicId) => topicId !== 1);

    if (topicIds.length === 0) {
      await ctx.reply("No topics to clear.");
      return;
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const topicId of topicIds) {
      try {
        await queue.enqueue(() => bot.api.deleteForumTopic(config.groupId, topicId));
        deletedCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.error("Failed to delete forum topic", {
          topicId,
          error: String(error),
        });
      }
    }

    sessionStore.clearAll();

    if (failedCount > 0) {
      await ctx.reply(`Cleared ${deletedCount} topics, ${failedCount} failed.`);
    } else {
      await ctx.reply(`Cleared ${deletedCount} topics.`);
    }
  };
}
