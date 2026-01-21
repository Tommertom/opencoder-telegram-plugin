import type { Context } from "grammy";
import type { CommandDeps } from "../commands/types.js";

export const createSessionsCallbackHandler = (deps: CommandDeps) => async (ctx: Context) => {
    if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;

    if (ctx.chat?.type !== "private") return;

    const data = ctx.callbackQuery.data;
    if (!data.startsWith("session:")) return;

    const sessionId = data.replace("session:", "");
    if (!sessionId) return;

    // Set the selected session as the current session
    deps.globalStateStore.setCurrentSession(sessionId);

    const sessionTitle = deps.globalStateStore.getSessionTitle(sessionId) || sessionId;

    await ctx.answerCallbackQuery({ text: `Active session set to ${sessionTitle}` });

    try {
        await ctx.editMessageText(`✅ Active session set to *${sessionTitle}*`, {
            parse_mode: "Markdown",
        });
    } catch (error) {
        await deps.bot.sendTemporaryMessage(`✅ Active session set to ${sessionTitle}`, 3000);
    }
};
