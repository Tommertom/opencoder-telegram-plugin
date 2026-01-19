import { type Context, InlineKeyboard } from "grammy";
import type { CommandDeps } from "../commands/types.js";
import type { QuestionTracker } from "../question-tracker.js";

export const createQuestionCallbackHandler =
    (deps: CommandDeps & { questionTracker: QuestionTracker }) => async (ctx: Context) => {
        if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;

        if (ctx.chat?.type !== "private") return;

        const data = ctx.callbackQuery.data;
        if (data.startsWith("session:")) {
            const sessionId = data.replace("session:", "").trim();
            if (!sessionId) return;

            deps.globalStateStore.setActiveSession(sessionId);
            const sessionTitle = deps.globalStateStore.getSessionTitle(sessionId);
            const label = sessionTitle ?? sessionId;
            await ctx.answerCallbackQuery({ text: `Active session set: ${label}` });
            await deps.bot.sendTemporaryMessage(`✅ Active session set: ${label}`, 3000);
            return;
        }

        if (!data.startsWith("q:")) return;

        // Format: q:{questionId}:{questionIndex}:{optionIndex|done}
        const parts = data.split(":");
        if (parts.length !== 4) return;

        const [_, questionId, questionIndexStr, action] = parts;
        const questionIndex = parseInt(questionIndexStr, 10);

        const session = deps.questionTracker.getActiveQuestionSession(questionId);
        if (!session) {
            await ctx.answerCallbackQuery({ text: "Question session expired or invalid." });
            return;
        }

        const question = session.questions[questionIndex];
        if (!question) return;

        // Get current answers for this question index
        // Use slightly different logic than recordAnswer to avoid sparse array issues initially
        let currentAnswers = session.answers[questionIndex] || [];

        if (action === "done") {
            if (currentAnswers.length === 0) {
                await ctx.answerCallbackQuery({ text: "Please select at least one option." });
                return;
            }
            await proceedToNext(ctx, deps, questionId, questionIndex);
        } else {
            const optionIndex = parseInt(action, 10);
            const option = question.options[optionIndex];

            if (!option) return;

            if (question.multiple) {
                if (currentAnswers.includes(option.label)) {
                    currentAnswers = currentAnswers.filter((a) => a !== option.label);
                } else {
                    currentAnswers.push(option.label);
                }
            } else {
                // Single select: set answer and proceed immediately
                currentAnswers = [option.label];
            }

            // Update state
            deps.questionTracker.recordAnswer(questionId, questionIndex, currentAnswers);

            if (!question.multiple) {
                // Single select -> Auto advance
                await ctx.answerCallbackQuery();
                await proceedToNext(ctx, deps, questionId, questionIndex);
            } else {
                // Multi select -> Update keyboard
                const keyboard = new InlineKeyboard();
                question.options.forEach((opt, idx) => {
                    const isSelected = currentAnswers.includes(opt.label);
                    const icon = isSelected ? "☑ " : "☐ ";
                    keyboard.text(`${icon}${opt.label}`, `q:${questionId}:${questionIndex}:${idx}`).row();
                });
                keyboard.text("Done", `q:${questionId}:${questionIndex}:done`);

                try {
                    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
                } catch (error) {
                    // Ignore "message is not modified" errors
                }
                await ctx.answerCallbackQuery();
            }
        }
    };

async function proceedToNext(
    ctx: Context,
    deps: CommandDeps & { questionTracker: QuestionTracker },
    questionId: string,
    currentIndex: number,
) {
    const session = deps.questionTracker.getActiveQuestionSession(questionId);
    if (!session) return;

    // Cleanup current message buttons?
    // Usually good UX to remove buttons or mark as answered.
    // Let's edit the message to show the selected answer(s) as text.
    const question = session.questions[currentIndex];
    const answers = session.answers[currentIndex] || [];

    try {
        await ctx.editMessageText(
            `❓ *${question.header}*\n\n${question.question}\n\n✅ *Answered*: ${answers.join(", ")}`,
            { parse_mode: "Markdown" },
        );
    } catch (e) {
        console.error("Failed to edit question message:", e);
    }

    const nextIndex = currentIndex + 1;

    // Check if there are more questions
    if (nextIndex < session.questions.length) {
        // Send next question
        // We need to import sendQuestion from event handler or duplicate logic?
        // Better to separate sendQuestion logic or put it in QuestionTracker or a utility.
        // For now, let's reuse the logic (duplicated for speed, but ideally refactored).

        const nextQuestion = session.questions[nextIndex];
        const isMultiple = nextQuestion.multiple ?? false;
        const keyboard = new InlineKeyboard();

        nextQuestion.options.forEach((option, optionIndex) => {
            const icon = isMultiple ? "☐ " : "";
            keyboard.text(`${icon}${option.label}`, `q:${questionId}:${nextIndex}:${optionIndex}`).row();
        });

        if (isMultiple) {
            keyboard.text("Done", `q:${questionId}:${nextIndex}:done`);
        }

        const messageText = `❓ *${nextQuestion.header}*\n\n${nextQuestion.question}\n\n${nextQuestion.options
            .map((o) => `• *${o.label}*: ${o.description}`)
            .join("\n")}`;

        const chatId = ctx.chat?.id;
        if (!chatId) {
            return;
        }

        const result = await deps.queue.enqueue(() =>
            ctx.api.sendMessage(chatId, messageText, {
                parse_mode: "Markdown",
                reply_markup: keyboard,
            }),
        );

        // Update tracking
        session.telegramMessageIds.push(result.message_id);
        session.currentQuestionIndex = nextIndex;
        deps.questionTracker.updateQuestionSession(questionId, session);
    } else {
        // All questions answered - Submit
        try {
            await deps.client.tui.control.response({
                body: {
                    type: "question.replied",
                    properties: {
                        sessionID: session.sessionId,
                        requestID: questionId,
                        answers: session.answers,
                    },
                },
            });
            await deps.bot.sendTemporaryMessage("✅ Answers submitted successfully!", 3000);
        } catch (error) {
            console.error("Failed to submit answers:", error);
            await deps.bot.sendMessage(`❌ Failed to submit answers: ${error}`);
        } finally {
            deps.questionTracker.clearQuestionSession(questionId);
        }
    }
}
