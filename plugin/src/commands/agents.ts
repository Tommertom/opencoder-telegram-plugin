import { InlineKeyboard, type Context } from "grammy";
import type { CommandDeps } from "./types.js";

export function createAgentsCommandHandler({
  config,
  client,
  logger,
  bot,
  globalStateStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /agents command received");
    if (ctx.chat?.type !== "private") return;

    try {
      // Fetch agents from the app namespace
      const agentsResponse = await client.app.agents();

      if (agentsResponse.error) {
        logger.error("Failed to list agents", { error: agentsResponse.error });
        await bot.sendTemporaryMessage("❌ Failed to list agents");
        return;
      }

      // Fetch config to get the default agent
      const configResponse = await client.config.get();
      let defaultAgent = "";
      if (configResponse.data) {
        // We cast to any because strict typing might not expose the specific field
        // depending on the generated types version, but we expect it to be there.
        // If not, we just won't show it.
        const cfg = configResponse.data as any;
        defaultAgent = cfg.default_agent || "";
      }

      const agents = agentsResponse.data || [];
      const primaryAgents = agents.filter((a: any) => a.mode === "primary" && !a.builtIn);

      // Update global state
      // We cast to any here to satisfy the store's strict type requirement if needed
      // because the SDK versions might have slight mismatches in our dev environment.
      globalStateStore.setAgents(primaryAgents as any[]);
      if (defaultAgent && primaryAgents.some((agent: any) => agent.name === defaultAgent)) {
        globalStateStore.setCurrentAgent(defaultAgent);
      }

      if (primaryAgents.length === 0) {
        await bot.sendTemporaryMessage("No primary agents found.");
        return;
      }

      const keyboard = new InlineKeyboard();
      primaryAgents.forEach((agent: any) => {
        const isSelected = agent.name === defaultAgent ? "✅ " : "";
        keyboard.text(`${isSelected}${agent.name}`, `agent:${agent.name}`).row();
      });

      const message = "*Select an agent:*";

      await bot.sendTemporaryMessage(message, 30000, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      logger.error("Failed to list agents", { error: String(error) });
      await bot.sendTemporaryMessage("❌ Failed to list agents");
    }
  };
}
