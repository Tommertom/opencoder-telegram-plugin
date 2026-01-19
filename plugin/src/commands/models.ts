import type { Model } from "@opencode-ai/sdk/v2";
import { type Context, InlineKeyboard } from "grammy";
import type { CommandDeps } from "./types.js";

export function createModelsCommandHandler({ client, logger, bot, globalStateStore }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /models command received");
    if (ctx.chat?.type !== "private") return;

    try {
      // Fetch providers from the provider namespace
      const providersResponse = await client.provider.list();

      if (providersResponse.error) {
        logger.error("Failed to list models", { error: providersResponse.error });
        await bot.sendTemporaryMessage("❌ Failed to list models");
        return;
      }

      // Fetch config to get the current model
      const configResponse = await client.config.get();
      let currentModel = "";

      if (configResponse.data) {
        // Cast to any to access model property safely
        const cfg = configResponse.data as any;
        currentModel = cfg.model || "";
      }

      const providers = (providersResponse.data || []) as any[];
      const chatModels: Model[] = [];

      // Flatten providers to get all models
      for (const provider of providers) {
        if (provider.models) {
          for (const modelKey in provider.models) {
            const model = provider.models[modelKey];
            if (model.status === "active" && model.capabilities?.output?.text) {
              chatModels.push(model);
            }
          }
        }
      }

      if (chatModels.length === 0) {
        await bot.sendTemporaryMessage("No available models found.");
        return;
      }

      const keyboard = new InlineKeyboard();

      // Sort models by provider, then name
      chatModels.sort((a, b) => {
        if (a.providerID !== b.providerID) {
          return a.providerID.localeCompare(b.providerID);
        }
        return a.name.localeCompare(b.name);
      });

      // Create a button for each model
      chatModels.forEach((model) => {
        const modelId = `${model.providerID}/${model.id}`;
        // If currentModel matches either the full ID or just the ID part (depending on how it's stored)
        const isSelected = currentModel === modelId ? "✅ " : "";

        // Truncate name if too long for button
        let displayName = `${model.providerID}: ${model.name}`;
        if (displayName.length > 30) {
          displayName = displayName.substring(0, 27) + "...";
        }

        keyboard.text(`${isSelected}${displayName}`, `model:${modelId}`).row();
      });

      const message = "*Select a model:*";

      await bot.sendTemporaryMessage(message, 60000, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      logger.error("Failed to list models", { error: String(error) });
      await bot.sendTemporaryMessage("❌ Failed to list models");
    }
  };
}
