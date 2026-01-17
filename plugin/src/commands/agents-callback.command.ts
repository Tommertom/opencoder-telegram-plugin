import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export const createAgentsCallbackHandler = (deps: CommandDeps) => async (ctx: Context) => {
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;

  const data = ctx.callbackQuery.data;
  if (!data.startsWith("agent:")) return;

  const agentName = data.replace("agent:", "");
  if (!agentName) return;

  if (ctx.chat?.id !== deps.config.groupId) return;

  const availableAgents = deps.globalStateStore.getAgents();
  const selectedAgent = availableAgents.find((agent) => agent.name === agentName);

  if (!selectedAgent) {
    await ctx.answerCallbackQuery({ text: "Agent not found or unavailable." });
    return;
  }

  deps.globalStateStore.setCurrentAgent(selectedAgent.name);
  await ctx.answerCallbackQuery({ text: `Active agent set to ${selectedAgent.name}` });

  try {
    await ctx.editMessageText(`✅ Active agent set to *${selectedAgent.name}*`, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    await deps.bot.sendTemporaryMessage(`✅ Active agent set to ${selectedAgent.name}`, 3000);
  }
};
