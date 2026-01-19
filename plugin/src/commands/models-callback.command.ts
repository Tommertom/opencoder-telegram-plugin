import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export const createModelsCallbackHandler = (deps: CommandDeps) => async (ctx: Context) => {
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;

  if (ctx.chat?.type !== "private") return;

  const data = ctx.callbackQuery.data;
  if (!data.startsWith("model:")) return;

  const modelId = data.replace("model:", "");
  if (!modelId) return;

  try {
    // Update the configuration with the selected model
    const result = await deps.client.config.update({
      body: {
        model: modelId,
      },
    });

    if (result.error) {
      throw new Error(String(result.error));
    }

    await ctx.answerCallbackQuery({ text: `Active model set to ${modelId}` });

    try {
      await ctx.editMessageText(`✅ Active model set to *${modelId}*`, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      // If message is too old to edit, send a new one
      await deps.bot.sendTemporaryMessage(`✅ Active model set to ${modelId}`, 3000);
    }
  } catch (error) {
    deps.logger.error("Failed to set model", { error: String(error) });
    await ctx.answerCallbackQuery({ text: "Failed to set model." });
  }
};
