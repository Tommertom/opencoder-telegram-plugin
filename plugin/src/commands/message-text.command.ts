import type { Context } from "grammy";
import { getDefaultKeyboardOptions } from "../lib/utils.js";
import type { CommandDeps } from "./types.js";

export function createMessageTextHandler({
  config,
  client,
  logger,
  globalStateStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log(`[Bot] Text message received: "${ctx.message?.text?.slice(0, 50)}..."`);
    if (ctx.chat?.id !== config.groupId) return;
    if (ctx.message?.text?.startsWith("/")) return;

    let sessionId = globalStateStore.getActiveSession();

    if (!sessionId) {
      try {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await ctx.reply("❌ Failed to initialize session", getDefaultKeyboardOptions());
          return;
        }

        sessionId = createSessionResponse.data.id;
        globalStateStore.setActiveSession(sessionId);

        logger.info("Auto-created session", {
          sessionId,
        });
      } catch (error) {
        logger.error("Failed to create session", { error: String(error) });
        await ctx.reply("❌ Failed to initialize session", getDefaultKeyboardOptions());
        return;
      }
    }

    const userMessage = ctx.message?.text;

    // Get the selected model from global state (if any)
    const selectedModel = globalStateStore.getSelectedModel();

    // Parse the model string into providerID and modelID
    let modelConfig: { providerID: string; modelID: string } | undefined;
    if (selectedModel) {
      const parts = selectedModel.split("/");
      if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
        modelConfig = {
          providerID: parts[0].trim(),
          modelID: parts[1].trim(),
        };
      }
    }

    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: userMessage || "" }],
          ...(modelConfig && { model: modelConfig }),
        },
      });

      if (response.error) {
        logger.error("Failed to send message to OpenCode", {
          error: response.error,
          sessionId,
        });
        await ctx.reply("❌ Failed to process message", getDefaultKeyboardOptions());
        return;
      }

      logger.debug("Forwarded message to OpenCode", {
        sessionId,
      });
    } catch (error) {
      logger.error("Failed to send message to OpenCode", {
        error: String(error),
        sessionId,
      });
      await ctx.reply("❌ Failed to process message", getDefaultKeyboardOptions());
    }
  };
}
