import type { Project } from "@opencode-ai/sdk";
import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createProjectsCommandHandler({ client, logger, bot }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /projects command received");
    if (ctx.chat?.type !== "private") return;

    try {
      const projectsResponse = await client.project.list();

      if (projectsResponse.error) {
        logger.error("Failed to list projects", { error: projectsResponse.error });
        await bot.sendTemporaryMessage("❌ Failed to list projects");
        return;
      }

      const projects = (projectsResponse.data || []) as Project[];

      if (projects.length === 0) {
        await bot.sendTemporaryMessage("No projects found.");
        return;
      }

      const currentProjectResponse = await client.project.current();
      const currentProject = currentProjectResponse.data;

      const message = projects
        .map((p, index) => {
          const name = p.worktree.split("/").pop() || p.worktree;
          const isCurrent = p.worktree === currentProject?.worktree;
          const marker = isCurrent ? "★ " : "";
          return `${index + 1}. ${marker}*${name}*\n   \`${p.worktree}\``;
        })
        .join("\n\n");

      await bot.sendMessage(`*Projects (${projects.length})*:\n\n${message}`, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error("Failed to list projects", { error: String(error) });
      await bot.sendTemporaryMessage("❌ Failed to list projects");
    }
  };
}
