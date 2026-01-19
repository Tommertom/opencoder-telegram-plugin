import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createDeleteSessionsCommandHandler({
  config,
  client,
  logger,
  globalStateStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /deletesessions command received");
    if (ctx.chat?.type !== "private") return;

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

    // Clear active session
    globalStateStore.clearActiveSession();

    await ctx.reply(`Deleted ${deletedSessions} sessions (${failedSessions} failed).`);
  };
}
