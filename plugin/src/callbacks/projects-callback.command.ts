import type { Context } from "grammy";
import type { CommandDeps } from "../commands/types.js";

export function createProjectsCallbackHandler({ client, logger, bot }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] Projects callback received", ctx.callbackQuery?.data);
    if (!ctx.callbackQuery?.data) return;

    try {
      const worktree = ctx.callbackQuery.data.replace("project:", "");

      const response = await client.project.select({
        body: { worktree },
      });

      if (response.error) {
        logger.error("Failed to select project", { error: response.error });
        await bot.sendTemporaryMessage("❌ Failed to select project");
        return;
      }

      await ctx.answerCallbackQuery({
        text: `Switched to project: ${worktree}`,
      });

      // Send a permanent confirmation message
      const name = worktree.split("/").pop() || worktree;
      await bot.sendMessage(`✅ Switched to project: *${name}*\n\`${worktree}\``, {
        parse_mode: "Markdown",
      });

      // Update the original message to reflect the new selection
      try {
        const projectsResponse = await client.project.list();
        if (projectsResponse.error) return;

        const projects = projectsResponse.data || [];

        // Don't need to fetch current project again as we just set it
        // and we know 'worktree' is the current one

        const message = projects
          .map((p, index) => {
            const name = p.worktree.split("/").pop() || p.worktree;
            const isCurrent = p.worktree === worktree;
            const marker = isCurrent ? "★ " : "";
            return `${index + 1}. ${marker}*${name}*\n   \`${p.worktree}\``;
          })
          .join("\n\n");

        const keyboard = {
          inline_keyboard: projects.map((p) => [
            {
              text:
                (p.worktree === worktree ? "★ " : "") + (p.worktree.split("/").pop() || p.worktree),
              callback_data: `project:${p.worktree}`,
            },
          ]),
        };

        if (ctx.callbackQuery.message?.message_id) {
          await ctx.api.editMessageText(
            ctx.chat!.id,
            ctx.callbackQuery.message.message_id,
            `*Projects (${projects.length})*:\n\n${message}`,
            {
              parse_mode: "Markdown",
              reply_markup: keyboard,
            },
          );
        }
      } catch (err) {
        // Ignore errors updating the message, as the action itself succeeded
        console.error("Failed to update project list message", err);
      }
    } catch (error) {
      logger.error("Failed to handle project selection", { error: String(error) });
      await bot.sendTemporaryMessage("❌ Failed to select project");
    }
  };
}
