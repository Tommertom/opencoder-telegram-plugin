import type { Context } from "grammy";
import type { CommandDeps } from "./types.js";

export const createModelsCallbackHandler = (deps: CommandDeps) => async (ctx: Context) => {
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;

  const data = ctx.callbackQuery.data;
  if (!data.startsWith("model:")) return;

  const modelId = data.replace("model:", "");
  if (!modelId) return;

  if (ctx.chat?.id !== deps.config.groupId) return;

  // Store the selected model in global state
  deps.globalStateStore.setSelectedModel(modelId);
  await ctx.answerCallbackQuery({ text: `Model set to ${modelId}` });

  try {
    await ctx.editMessageText(`✅ Model set to *${modelId}*`, {
      parse_mode: "Markdown",
    });
  } catch (_error) {
    await deps.bot.sendTemporaryMessage(`✅ Model set to ${modelId}`, 3000);
  }
};
