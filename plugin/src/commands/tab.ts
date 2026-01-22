import type { Context } from "grammy";
import { getDefaultKeyboardOptions } from "../lib/utils.js";
import type { CommandDeps } from "./types.js";

export function createTabCommandHandler(deps: CommandDeps) {
  const { config, client, logger, globalStateStore, bot } = deps;
  return async (ctx: Context) => {
    console.log("[Bot] /tab command received");
    if (ctx.chat?.type !== "private") return;

    // Enforce authorization explicitly so middleware cannot be bypassed
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /tab attempt by unauthorized user ${userId}`);
      await deps.queue.enqueue(() =>
        ctx.reply("You are not authorized to use this bot.", getDefaultKeyboardOptions()),
      );
      return;
    }

    let agents = globalStateStore.getAgents();

    // If no agents in store, try to fetch them
    if (agents.length === 0) {
      try {
        const agentsResponse = await client.app.agents();
        if (agentsResponse.data) {
          const allAgents = agentsResponse.data as any[];
          // Filter to show only primary, non-internal agents
          // Internal agents: title, compaction, summary, and other built-in subagents
          const internalAgentNames = ["title", "compaction", "summary"];
          const primaryAgents = allAgents.filter(
            (a: any) =>
              a.mode === "primary" &&
              !a.builtIn &&
              !internalAgentNames.includes(a.name.toLowerCase()),
          );
          globalStateStore.setAgents(primaryAgents);
          agents = primaryAgents;
        }
      } catch (err) {
        logger.error("Failed to fetch agents in /tab", { error: String(err) });
      }
    }

    if (agents.length === 0) {
      await bot.sendTemporaryMessage("❌ No agents available.");
      return;
    }

    const currentAgentName = globalStateStore.getCurrentAgent();
    const currentIndex = agents.findIndex((a) => a.name === currentAgentName);

    // Cycle to next (or start at 0 if current not found)
    const nextIndex = (currentIndex + 1) % agents.length;
    const nextAgent = agents[nextIndex];

    globalStateStore.setCurrentAgent(nextAgent.name);

    await bot.sendTemporaryMessage(`🔄 Active agent: ${nextAgent.name}`);
  };
}
