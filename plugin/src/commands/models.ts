import { type Context, InlineKeyboard } from "grammy";
import type { CommandDeps } from "./types.js";

export function createModelsCommandHandler({
  config,
  client,
  logger,
  bot,
  globalStateStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /models command received");
    if (ctx.chat?.id !== config.groupId) return;

    try {
      // Fetch providers to get all available models
      const providersResponse = await client.config.providers();

      if (providersResponse.error) {
        logger.error("Failed to list providers", { error: providersResponse.error });
        await bot.sendTemporaryMessage("❌ Failed to list models");
        return;
      }

      // Fetch config to get the current model
      const configResponse = await client.config.get();
      let currentModel = "";
      if (configResponse.data) {
        // Safely access the model property
        const configData = configResponse.data;
        currentModel = (configData as { model?: string }).model || "";
      }

      // Get selected model from state store (overrides config default)
      const selectedModel = globalStateStore.getSelectedModel() || currentModel;

      const providersData = providersResponse.data;
      if (!providersData || !providersData.providers) {
        await bot.sendTemporaryMessage("No providers found.");
        return;
      }

      // Build a list of all available models from all providers
      const allModels: Array<{
        id: string;
        name: string;
        providerId: string;
        providerName: string;
      }> = [];

      for (const provider of providersData.providers) {
        if (provider.models) {
          for (const [_modelKey, model] of Object.entries(provider.models)) {
            allModels.push({
              id: `${provider.id}/${model.id}`,
              name: model.name,
              providerId: provider.id,
              providerName: provider.name,
            });
          }
        }
      }

      if (allModels.length === 0) {
        await bot.sendTemporaryMessage("No models found.");
        return;
      }

      // Sort models by provider and name
      allModels.sort((a, b) => {
        const providerCompare = a.providerId.localeCompare(b.providerId);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });

      // Build inline keyboard with models
      const keyboard = new InlineKeyboard();
      for (const model of allModels) {
        const isSelected = model.id === selectedModel ? "✅ " : "";
        const displayName = `${isSelected}${model.providerName}: ${model.name}`;
        keyboard.text(displayName, `model:${model.id}`).row();
      }

      const message = `*Select a model:*\n\nCurrent: \`${selectedModel || "default"}\``;

      await bot.sendTemporaryMessage(message, 30000, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      logger.error("Failed to list models", { error: String(error) });
      await bot.sendTemporaryMessage("❌ Failed to list models");
    }
  };
}
