import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createSessionsCommandHandler({ config, client, logger, bot }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /sessions command received");
    if (ctx.chat?.id !== config.groupId) return;

    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    let limit: number | undefined;

    if (arg) {
      const parsed = Number.parseInt(arg, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        await bot.sendTemporaryMessage("❌ Invalid argument. Please provide a valid number.");
        return;
      }
      limit = parsed;
    }

    try {
      const sessionsResponse = await client.session.list();

      if (sessionsResponse.error) {
        logger.error("Failed to list sessions", { error: sessionsResponse.error });
        await bot.sendTemporaryMessage("❌ Failed to list sessions");
        return;
      }

      let sessions = sessionsResponse.data || [];

      if (sessions.length === 0) {
        await bot.sendTemporaryMessage("No active sessions found.");
        return;
      }

      if (limit) {
        sessions = sessions.slice(0, limit);
      }

      const sessionList = sessions
        .map((s: any) => {
          const title = s.title || s.properties?.info?.title;
          return title ? `- ${title} (\`${s.id}\`)` : `- \`${s.id}\``;
        })
        .join("\n");
      const message = `Found ${sessions.length} active sessions:\n\n${sessionList}`;

      // Display for 30 seconds
      await bot.sendTemporaryMessage(message, 30000);
    } catch (error) {
      logger.error("Failed to list sessions", { error: String(error) });
      await bot.sendTemporaryMessage("❌ Failed to list sessions");
    }
  };
}
