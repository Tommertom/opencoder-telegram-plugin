/**
 * OpenCoder Telegram Remote Plugin
 * https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin
 */

// src/bot.ts
import { Bot, InputFile } from "grammy";

// src/callbacks/agents-callback.command.ts
var createAgentsCallbackHandler = (deps) => async (ctx) => {
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
    await ctx.editMessageText(`\u2705 Active agent set to *${selectedAgent.name}*`, {
      parse_mode: "Markdown"
    });
  } catch (error) {
    await deps.bot.sendTemporaryMessage(`\u2705 Active agent set to ${selectedAgent.name}`, 3e3);
  }
};

// src/callbacks/question-callback.command.ts
import { InlineKeyboard } from "grammy";
var createQuestionCallbackHandler = (deps) => async (ctx) => {
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;
  const data = ctx.callbackQuery.data;
  if (data.startsWith("session:")) {
    const sessionId = data.replace("session:", "").trim();
    if (!sessionId) return;
    deps.globalStateStore.setActiveSession(sessionId);
    const sessionTitle = deps.globalStateStore.getSessionTitle(sessionId);
    const label = sessionTitle ?? sessionId;
    await ctx.answerCallbackQuery({ text: `Active session set: ${label}` });
    await deps.bot.sendTemporaryMessage(`\u2705 Active session set: ${label}`, 3e3);
    return;
  }
  if (!data.startsWith("q:")) return;
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
      currentAnswers = [option.label];
    }
    deps.questionTracker.recordAnswer(questionId, questionIndex, currentAnswers);
    if (!question.multiple) {
      await ctx.answerCallbackQuery();
      await proceedToNext(ctx, deps, questionId, questionIndex);
    } else {
      const keyboard = new InlineKeyboard();
      question.options.forEach((opt, idx) => {
        const isSelected = currentAnswers.includes(opt.label);
        const icon = isSelected ? "\u2611 " : "\u2610 ";
        keyboard.text(`${icon}${opt.label}`, `q:${questionId}:${questionIndex}:${idx}`).row();
      });
      keyboard.text("Done", `q:${questionId}:${questionIndex}:done`);
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      } catch (error) {
      }
      await ctx.answerCallbackQuery();
    }
  }
};
async function proceedToNext(ctx, deps, questionId, currentIndex) {
  const session = deps.questionTracker.getActiveQuestionSession(questionId);
  if (!session) return;
  const question = session.questions[currentIndex];
  const answers = session.answers[currentIndex] || [];
  try {
    await ctx.editMessageText(
      `\u2753 *${question.header}*

${question.question}

\u2705 *Answered*: ${answers.join(", ")}`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("Failed to edit question message:", e);
  }
  const nextIndex = currentIndex + 1;
  if (nextIndex < session.questions.length) {
    const nextQuestion = session.questions[nextIndex];
    const isMultiple = nextQuestion.multiple ?? false;
    const keyboard = new InlineKeyboard();
    nextQuestion.options.forEach((option, optionIndex) => {
      const icon = isMultiple ? "\u2610 " : "";
      keyboard.text(`${icon}${option.label}`, `q:${questionId}:${nextIndex}:${optionIndex}`).row();
    });
    if (isMultiple) {
      keyboard.text("Done", `q:${questionId}:${nextIndex}:done`);
    }
    const messageText = `\u2753 *${nextQuestion.header}*

${nextQuestion.question}

${nextQuestion.options.map((o) => `\u2022 *${o.label}*: ${o.description}`).join("\n")}`;
    const result = await deps.queue.enqueue(
      () => ctx.api.sendMessage(deps.config.groupId, messageText, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      })
    );
    session.telegramMessageIds.push(result.message_id);
    session.currentQuestionIndex = nextIndex;
    deps.questionTracker.updateQuestionSession(questionId, session);
  } else {
    try {
      await deps.client.tui.control.response({
        body: {
          type: "question.replied",
          properties: {
            sessionID: session.sessionId,
            requestID: questionId,
            answers: session.answers
          }
        }
      });
      await deps.bot.sendTemporaryMessage("\u2705 Answers submitted successfully!", 3e3);
    } catch (error) {
      console.error("Failed to submit answers:", error);
      await deps.bot.sendMessage(`\u274C Failed to submit answers: ${error}`);
    } finally {
      deps.questionTracker.clearQuestionSession(questionId);
    }
  }
}

// src/commands/audio-message.command.ts
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// src/lib/audio-transcription.ts
import { readFile, unlink } from "fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { createPartFromUri, createUserContent, GoogleGenAI } from "@google/genai";
import { experimental_transcribe as transcribe } from "ai";
async function transcribeWithOpenAI(audioFilePath, apiKey, logger) {
  try {
    const audioBuffer = await readFile(audioFilePath);
    const openaiProvider = createOpenAI({ apiKey });
    const { text } = await transcribe({
      model: openaiProvider.transcription("whisper-1"),
      audio: audioBuffer
    });
    return { text };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("OpenAI transcription failed", { error: errorMessage });
    return { text: "", error: errorMessage };
  }
}
async function transcribeWithGemini(audioFilePath, apiKey, mimeType, logger) {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const uploadedFile = await ai.files.upload({
      file: audioFilePath,
      config: { mimeType }
    });
    if (!uploadedFile.uri) {
      throw new Error("Failed to get URI for uploaded file");
    }
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri || "", uploadedFile.mimeType || "audio/ogg"),
        "Transcribe this audio file. Return only the transcribed text without any additional formatting, explanations, or markdown."
      ])
    });
    const text = response.text || "";
    return { text };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Gemini transcription failed", { error: errorMessage });
    return { text: "", error: errorMessage };
  }
}
async function transcribeAudio(audioFilePath, config, mimeType, logger) {
  logger.info("Starting audio transcription", {
    provider: config.provider,
    mimeType
  });
  const result = config.provider === "openai" ? await transcribeWithOpenAI(audioFilePath, config.apiKey, logger) : await transcribeWithGemini(audioFilePath, config.apiKey, mimeType, logger);
  try {
    await unlink(audioFilePath);
    logger.debug("Cleaned up audio file", { audioFilePath });
  } catch (error) {
    logger.warn("Failed to clean up audio file", { error: String(error) });
  }
  return result;
}

// src/commands/audio-message.command.ts
var SUPPORTED_FORMATS = [
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/m4a",
  "audio/flac",
  "audio/opus"
];
var MAX_FILE_SIZE = 25 * 1024 * 1024;
function createAudioMessageHandler({
  config,
  client,
  logger,
  globalStateStore
}) {
  return async (ctx) => {
    console.log("[Bot] Audio/voice message received");
    if (!config.audioTranscriptionApiKey || !config.audioTranscriptionProvider) {
      await ctx.reply(
        "\u{1F399}\uFE0F Voice transcription is not configured. Please add AUDIO_TRANSCRIPTION_API_KEY to .env"
      );
      return;
    }
    if (ctx.chat?.id !== config.groupId) return;
    const voice = ctx.message?.voice;
    const audio = ctx.message?.audio;
    const fileToDownload = voice || audio;
    if (!fileToDownload) {
      await ctx.reply("\u274C No audio file found in message");
      return;
    }
    if (fileToDownload.file_size && fileToDownload.file_size > MAX_FILE_SIZE) {
      await ctx.reply("\u274C Audio file too large (max 25MB)");
      return;
    }
    const mimeType = fileToDownload.mime_type || "audio/ogg";
    if (!SUPPORTED_FORMATS.includes(mimeType)) {
      await ctx.reply(`\u274C Unsupported audio format: ${mimeType}`);
      return;
    }
    try {
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
      const tempDir = join(tmpdir(), "opencode-audio");
      await mkdir(tempDir, { recursive: true });
      const timestamp = Date.now();
      const extension = mimeType.split("/")[1] || "ogg";
      const tempFilePath = join(tempDir, `voice_${timestamp}.${extension}`);
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      await writeFile(tempFilePath, Buffer.from(arrayBuffer));
      logger.info("Downloaded audio file", { tempFilePath, mimeType });
      const processingMsg = await ctx.reply("\u{1F399}\uFE0F Transcribing audio...");
      const result = await transcribeAudio(
        tempFilePath,
        {
          apiKey: config.audioTranscriptionApiKey,
          provider: config.audioTranscriptionProvider
        },
        mimeType,
        logger
      );
      await ctx.api.deleteMessage(config.groupId, processingMsg.message_id);
      if (result.error || !result.text.trim()) {
        await ctx.reply(`\u274C Transcription failed: ${result.error || "Empty transcription"}`);
        return;
      }
      logger.info("Transcription successful", { textLength: result.text.length });
      let sessionId = globalStateStore.getActiveSession();
      if (!sessionId) {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await ctx.reply("\u274C Failed to initialize session for voice transcription");
          return;
        }
        sessionId = createSessionResponse.data.id;
        globalStateStore.setActiveSession(sessionId);
        logger.info("Auto-created session for voice message", { sessionId });
      }
      const promptResponse = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: result.text }]
        }
      });
      if (promptResponse.error) {
        logger.error("Failed to send transcription to OpenCode", {
          error: promptResponse.error
        });
        await ctx.reply("\u274C Failed to send transcription to OpenCode");
        return;
      }
      await ctx.reply(`\u2705 Transcribed and sent:
\`${result.text}\``, {
        parse_mode: "Markdown"
      });
      logger.debug("Sent transcription to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Audio message handling failed", { error: String(error) });
      await ctx.reply(`\u274C Failed to process audio: ${String(error)}`);
    }
  };
}

// src/commands/agents.ts
import { InlineKeyboard as InlineKeyboard2 } from "grammy";
function createAgentsCommandHandler({
  config,
  client,
  logger,
  bot,
  globalStateStore
}) {
  return async (ctx) => {
    console.log("[Bot] /agents command received");
    if (ctx.chat?.id !== config.groupId) return;
    try {
      const agentsResponse = await client.app.agents();
      if (agentsResponse.error) {
        logger.error("Failed to list agents", { error: agentsResponse.error });
        await bot.sendTemporaryMessage("\u274C Failed to list agents");
        return;
      }
      const configResponse = await client.config.get();
      let defaultAgent = "";
      if (configResponse.data) {
        const cfg = configResponse.data;
        defaultAgent = cfg.default_agent || "";
      }
      const agents = agentsResponse.data || [];
      const primaryAgents = agents.filter((a) => a.mode === "primary" && !a.builtIn);
      globalStateStore.setAgents(primaryAgents);
      if (defaultAgent && primaryAgents.some((agent) => agent.name === defaultAgent)) {
        globalStateStore.setCurrentAgent(defaultAgent);
      }
      if (primaryAgents.length === 0) {
        await bot.sendTemporaryMessage("No primary agents found.");
        return;
      }
      const keyboard = new InlineKeyboard2();
      primaryAgents.forEach((agent) => {
        const isSelected = agent.name === defaultAgent ? "\u2705 " : "";
        keyboard.text(`${isSelected}${agent.name}`, `agent:${agent.name}`).row();
      });
      const message = "*Select an agent:*";
      await bot.sendTemporaryMessage(message, 3e4, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error("Failed to list agents", { error: String(error) });
      await bot.sendTemporaryMessage("\u274C Failed to list agents");
    }
  };
}

// src/commands/deletesessions.ts
function createDeleteSessionsCommandHandler({
  config,
  client,
  logger,
  globalStateStore
}) {
  return async (ctx) => {
    console.log("[Bot] /deletesessions command received");
    if (ctx.chat?.id !== config.groupId) return;
    let deletedSessions = 0;
    let failedSessions = 0;
    try {
      const sessionsResponse = await client.session.list();
      if (sessionsResponse.error) {
        logger.error("Failed to list sessions", { error: sessionsResponse.error });
        await ctx.reply("\u274C Failed to list sessions");
        return;
      }
      const sessions = sessionsResponse.data || [];
      for (const session of sessions) {
        try {
          const deleteResponse = await client.session.delete({
            path: { id: session.id }
          });
          if (deleteResponse.error) {
            failedSessions += 1;
            logger.error("Failed to delete session", {
              sessionId: session.id,
              error: deleteResponse.error
            });
            continue;
          }
          deletedSessions += 1;
        } catch (error) {
          failedSessions += 1;
          logger.error("Failed to delete session", {
            sessionId: session.id,
            error: String(error)
          });
        }
      }
    } catch (error) {
      logger.error("Failed to delete sessions", { error: String(error) });
      await ctx.reply("\u274C Failed to delete sessions");
      return;
    }
    globalStateStore.clearActiveSession();
    await ctx.reply(`Deleted ${deletedSessions} sessions (${failedSessions} failed).`);
  };
}

// src/lib/utils.ts
import { mkdirSync, writeFileSync } from "fs";
import { join as join2 } from "path";

// src/lib/keyboard.ts
import { Keyboard } from "grammy";
function createDefaultKeyboard() {
  const keyboard = new Keyboard().text("/tab").text("/esc").resized().persistent();
  return keyboard;
}

// src/lib/utils.ts
async function sendTemporaryMessage(bot, chatId, text, durationMs = 1e3, queue, options) {
  try {
    const sendFn = () => bot.api.sendMessage(chatId, text, options);
    const sentMessage = queue ? await queue.enqueue(sendFn) : await sendFn();
    const messageId = sentMessage.message_id;
    setTimeout(async () => {
      try {
        const deleteFn = () => bot.api.deleteMessage(chatId, messageId);
        if (queue) {
          await queue.enqueue(deleteFn);
        } else {
          await deleteFn();
        }
      } catch (error) {
        console.warn("Failed to delete temporary message", { error: String(error), messageId });
      }
    }, durationMs);
  } catch (error) {
    console.error("Failed to send temporary message", { error: String(error) });
  }
}
function getDefaultKeyboardOptions() {
  return {
    reply_markup: createDefaultKeyboard()
  };
}

// src/commands/esc.ts
function createEscCommandHandler({ config, client, logger, globalStateStore }) {
  return async (ctx) => {
    console.log("[Bot] /esc command received");
    if (ctx.chat?.id !== config.groupId) return;
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /esc attempt by unauthorized user ${userId}`);
      await ctx.reply("You are not authorized to use this bot.", getDefaultKeyboardOptions());
      return;
    }
    const sessionId = globalStateStore.getActiveSession();
    if (!sessionId) {
      await ctx.reply("\u274C No active session. Use /new to create one.", getDefaultKeyboardOptions());
      return;
    }
    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: "\x1B" }]
        }
      });
      if (response.error) {
        logger.error("Failed to send escape to OpenCode", {
          error: response.error,
          sessionId
        });
        await ctx.reply("\u274C Failed to send escape", getDefaultKeyboardOptions());
        return;
      }
      logger.debug("Sent escape to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Failed to send escape to OpenCode", {
        error: String(error),
        sessionId
      });
      await ctx.reply("\u274C Failed to send escape", getDefaultKeyboardOptions());
    }
  };
}

// src/commands/help.ts
function createHelpCommandHandler({ config }) {
  return async (ctx) => {
    console.log("[Bot] /help command received");
    if (ctx.chat?.id !== config.groupId) return;
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /help attempt by unauthorized user ${userId}`);
      await ctx.reply("You are not authorized to use this bot.");
      return;
    }
    const helpMessage = "Available commands:\n\n/new - Create a new OpenCode session.\n/deletesessions - Delete all OpenCode sessions.\n/sessions - List all active OpenCode sessions.\n/agents - List available agents.\n/todos - Show current todos.\n/tab - Send a Tab key to the active session.\n/esc - Send an Escape key to the active session.\n/help - Show this help message.\n\nUsage:\n- Use /new to create a new session.\n- Use /todos to list the current todos.\n- Send messages in this chat to interact with the active session.\n- Send voice messages or audio files (max 25MB) to transcribe and send them as prompts.\n- Use Tab and Esc buttons or commands to send special keys.\n- Admin-only commands (like /deletesessions) are restricted to configured users.\n\nNote: All commands require you to be a configured allowed user. The bot enforces this via its middleware and command-level checks.";
    await ctx.reply(helpMessage, getDefaultKeyboardOptions());
  };
}

// src/commands/message-text.command.ts
function createMessageTextHandler({
  config,
  client,
  logger,
  globalStateStore
}) {
  return async (ctx) => {
    console.log(`[Bot] Text message received: "${ctx.message?.text?.slice(0, 50)}..."`);
    if (ctx.chat?.id !== config.groupId) return;
    if (ctx.message?.text?.startsWith("/")) return;
    let sessionId = globalStateStore.getActiveSession();
    if (!sessionId) {
      try {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await ctx.reply("\u274C Failed to initialize session", getDefaultKeyboardOptions());
          return;
        }
        sessionId = createSessionResponse.data.id;
        globalStateStore.setActiveSession(sessionId);
        logger.info("Auto-created session", {
          sessionId
        });
      } catch (error) {
        logger.error("Failed to create session", { error: String(error) });
        await ctx.reply("\u274C Failed to initialize session", getDefaultKeyboardOptions());
        return;
      }
    }
    const userMessage = ctx.message?.text;
    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: userMessage || "" }]
        }
      });
      if (response.error) {
        logger.error("Failed to send message to OpenCode", {
          error: response.error,
          sessionId
        });
        await ctx.reply("\u274C Failed to process message", getDefaultKeyboardOptions());
        return;
      }
      logger.debug("Forwarded message to OpenCode", {
        sessionId
      });
    } catch (error) {
      logger.error("Failed to send message to OpenCode", {
        error: String(error),
        sessionId
      });
      await ctx.reply("\u274C Failed to process message", getDefaultKeyboardOptions());
    }
  };
}

// src/commands/new.ts
function createNewCommandHandler({
  bot,
  config,
  client,
  logger,
  globalStateStore
}) {
  return async (ctx) => {
    console.log("[Bot] /new command received");
    if (ctx.chat?.id !== config.groupId) return;
    try {
      const createSessionResponse = await client.session.create({ body: {} });
      if (createSessionResponse.error) {
        logger.error("Failed to create session", { error: createSessionResponse.error });
        await ctx.reply("\u274C Failed to create session", getDefaultKeyboardOptions());
        return;
      }
      const sessionId = createSessionResponse.data.id;
      globalStateStore.setActiveSession(sessionId);
      logger.info("Created new session", {
        sessionId
      });
      await bot.sendMessage(`\u2705 Session created: ${sessionId}`);
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await ctx.reply("\u274C Failed to create session", getDefaultKeyboardOptions());
    }
  };
}

// src/commands/sessions.ts
import { InlineKeyboard as InlineKeyboard3 } from "grammy";
function getSessionInfo(session) {
  return session.properties?.info ?? session;
}
function isArchived(session) {
  const info = getSessionInfo(session);
  if (!info.time || !("archived" in info.time)) {
    return false;
  }
  return Boolean(info.time.archived);
}
function getSessionLabel(session) {
  const info = getSessionInfo(session);
  const rawTitle = typeof info.title === "string" ? info.title.trim() : "";
  if (rawTitle) {
    return rawTitle;
  }
  const id = info.id ?? session.id ?? "unknown";
  return id;
}
function createSessionsCommandHandler({
  config,
  client,
  logger,
  bot,
  globalStateStore
}) {
  return async (ctx) => {
    console.log("[Bot] /sessions command received");
    if (ctx.chat?.id !== config.groupId) return;
    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    let limit;
    if (arg) {
      if (!/^\d+$/.test(arg)) {
        await bot.sendTemporaryMessage("\u274C Invalid argument. Please provide a valid number.");
        return;
      }
      const parsed = Number.parseInt(arg, 10);
      if (parsed <= 0) {
        await bot.sendTemporaryMessage(
          "\u274C Invalid argument. Please provide a number greater than 0."
        );
        return;
      }
      limit = parsed;
    }
    try {
      const sessionsResponse = await client.session.list();
      if (sessionsResponse.error) {
        logger.error("Failed to list sessions", { error: sessionsResponse.error });
        await bot.sendTemporaryMessage("\u274C Failed to list sessions");
        return;
      }
      let sessions = sessionsResponse.data || [];
      sessions = sessions.filter((session) => !isArchived(session));
      if (sessions.length === 0) {
        await bot.sendTemporaryMessage("No active sessions found.");
        return;
      }
      if (limit) {
        sessions = sessions.slice(0, limit);
      }
      const keyboard = new InlineKeyboard3();
      sessions.forEach((session) => {
        const label = getSessionLabel(session);
        globalStateStore.setSessionTitle(session.id, label);
        keyboard.text(label, `session:${session.id}`).row();
      });
      const message = `Select an active session (${sessions.length} found):`;
      await bot.sendTemporaryMessage(message, 3e4, { reply_markup: keyboard });
    } catch (error) {
      logger.error("Failed to list sessions", { error: String(error) });
      await bot.sendTemporaryMessage("\u274C Failed to list sessions");
    }
  };
}

// src/commands/tab.ts
function createTabCommandHandler({ config, client, logger, globalStateStore }) {
  return async (ctx) => {
    console.log("[Bot] /tab command received");
    if (ctx.chat?.id !== config.groupId) return;
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /tab attempt by unauthorized user ${userId}`);
      await ctx.reply("You are not authorized to use this bot.", getDefaultKeyboardOptions());
      return;
    }
    const sessionId = globalStateStore.getActiveSession();
    if (!sessionId) {
      await ctx.reply("\u274C No active session. Use /new to create one.", getDefaultKeyboardOptions());
      return;
    }
    try {
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: "	" }]
        }
      });
      if (response.error) {
        logger.error("Failed to send tab to OpenCode", {
          error: response.error,
          sessionId
        });
        await ctx.reply("\u274C Failed to send tab", getDefaultKeyboardOptions());
        return;
      }
      logger.debug("Sent tab to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Failed to send tab to OpenCode", {
        error: String(error),
        sessionId
      });
      await ctx.reply("\u274C Failed to send tab", getDefaultKeyboardOptions());
    }
  };
}

// src/commands/todos.ts
var STATUS_ICONS = {
  pending: "\u23F3",
  in_progress: "\u{1F6A7}",
  completed: "\u2705",
  cancelled: "\u{1F6AB}"
};
var PRIORITY_ICONS = {
  low: "\u{1F7E2}",
  medium: "\u{1F7E1}",
  high: "\u{1F534}"
};
function formatTodoLine(todo) {
  const statusIcon = STATUS_ICONS[todo.status] ?? "\u23F3";
  const priorityIcon = PRIORITY_ICONS[todo.priority] ?? "\u{1F7E1}";
  const content = todo.content?.trim() || "Untitled todo";
  return `${statusIcon} ${priorityIcon} ${content}`;
}
function createTodosCommandHandler({ config, bot, globalStateStore }) {
  return async (ctx) => {
    console.log("[Bot] /todos command received");
    if (ctx.chat?.id !== config.groupId) return;
    const todos = globalStateStore.getTodos();
    if (todos.length === 0) {
      await bot.sendTemporaryMessage("No todos currently available.");
      return;
    }
    const lines = todos.map((todo) => formatTodoLine(todo));
    const message = `Current todos (${todos.length}):

${lines.join("\n")}`;
    await bot.sendTemporaryMessage(message, 3e4);
  };
}

// src/lib/telegram-queue.ts
var TelegramQueue = class {
  queue = [];
  processing = false;
  intervalId = null;
  intervalMs;
  constructor(intervalMs = 500) {
    this.intervalMs = intervalMs;
  }
  /**
   * Add a Telegram API call to the queue
   * @param fn - Async function that makes the Telegram API call
   * @returns Promise that resolves when the call completes
   */
  enqueue(fn) {
    return new Promise((resolve2, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve2(result);
        } catch (error) {
          reject(error);
        }
      });
      if (!this.processing) {
        this.start();
      }
    });
  }
  /**
   * Start processing the queue
   */
  start() {
    if (this.processing) {
      return;
    }
    this.processing = true;
    this.intervalId = setInterval(() => {
      this.processNext();
    }, this.intervalMs);
    this.processNext();
  }
  /**
   * Process the next item in the queue
   */
  async processNext() {
    if (this.queue.length === 0) {
      this.stop();
      return;
    }
    const fn = this.queue.shift();
    if (fn) {
      try {
        await fn();
      } catch (error) {
        console.error("[TelegramQueue] Error processing queue item:", error);
      }
    }
  }
  /**
   * Stop processing the queue
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.processing = false;
  }
  /**
   * Get the current queue size
   */
  get size() {
    return this.queue.length;
  }
  /**
   * Check if the queue is currently processing
   */
  get isProcessing() {
    return this.processing;
  }
  /**
   * Clear all pending items in the queue
   */
  clear() {
    this.queue = [];
    this.stop();
  }
};

// src/bot.ts
var botInstance = null;
function isUserAllowed(ctx, allowedUserIds) {
  const userId = ctx.from?.id;
  if (!userId) return false;
  return allowedUserIds.includes(userId);
}
function createTelegramBot(config, client, logger, globalStateStore, questionTracker) {
  console.log("[Bot] createTelegramBot called");
  const queue = new TelegramQueue(500);
  if (botInstance) {
    console.log("[Bot] Reusing existing bot instance");
    logger.warn("Bot already initialized, reusing existing instance");
    return createBotManager(botInstance, config, queue);
  }
  console.log("[Bot] Creating new Bot instance with token");
  const bot = new Bot(config.botToken);
  botInstance = bot;
  console.log("[Bot] Bot instance created");
  console.log("[Bot] Setting up middleware and handlers...");
  bot.use(async (ctx, next) => {
    if (!isUserAllowed(ctx, config.allowedUserIds)) {
      console.log(`[Bot] Unauthorized access attempt from user ${ctx.from?.id}`);
      logger.warn("Unauthorized user attempted access", { userId: ctx.from?.id });
      return;
    }
    await next();
  });
  const manager = createBotManager(bot, config, queue);
  const commandDeps = {
    bot: manager,
    config,
    client,
    logger,
    globalStateStore,
    queue,
    questionTracker
  };
  bot.command("new", createNewCommandHandler(commandDeps));
  bot.command("deletesessions", createDeleteSessionsCommandHandler(commandDeps));
  bot.command("sessions", createSessionsCommandHandler(commandDeps));
  bot.command("agents", createAgentsCommandHandler(commandDeps));
  bot.command("help", createHelpCommandHandler(commandDeps));
  bot.command("tab", createTabCommandHandler(commandDeps));
  bot.command("esc", createEscCommandHandler(commandDeps));
  bot.command("todos", createTodosCommandHandler(commandDeps));
  bot.on("message:text", createMessageTextHandler(commandDeps));
  bot.on("message:voice", createAudioMessageHandler(commandDeps));
  bot.on("message:audio", createAudioMessageHandler(commandDeps));
  bot.callbackQuery(/^(session:|q:)/, createQuestionCallbackHandler(commandDeps));
  bot.callbackQuery(/^agent:/, createAgentsCallbackHandler(commandDeps));
  bot.catch((error) => {
    console.error("[Bot] Bot error caught:", error);
    logger.error("Bot error", { error: String(error) });
  });
  console.log("[Bot] All handlers registered, returning bot manager");
  return manager;
}
function createBotManager(bot, config, queue) {
  return {
    async start() {
      console.log("[Bot] start() called - beginning long polling...");
      await bot.start({
        drop_pending_updates: true,
        onStart: async () => {
          console.log("[Bot] Telegram bot polling started successfully");
          try {
            await sendTemporaryMessage(bot, config.groupId, "Messaging enabled", 1e3, queue);
            console.log("[Bot] Startup message sent to group");
          } catch (error) {
            console.error("[Bot] Failed to send startup message:", error);
          }
        }
      });
    },
    async stop() {
      console.log("[Bot] stop() called");
      await bot.stop();
      botInstance = null;
      console.log("[Bot] Bot stopped and instance cleared");
    },
    async sendMessage(text, options) {
      console.log(`[Bot] sendMessage: "${text.slice(0, 50)}..."`);
      const mergedOptions = {
        ...options,
        reply_markup: options?.reply_markup || createDefaultKeyboard()
      };
      const result = await queue.enqueue(
        () => bot.api.sendMessage(config.groupId, text, mergedOptions)
      );
      return { message_id: result.message_id };
    },
    async editMessage(messageId, text) {
      console.log(`[Bot] editMessage ${messageId}: "${text.slice(0, 50)}..."`);
      await queue.enqueue(() => bot.api.editMessageText(config.groupId, messageId, text));
    },
    async sendDocument(document, filename) {
      console.log(`[Bot] sendDocument: filename="${filename}"`);
      await queue.enqueue(
        () => bot.api.sendDocument(
          config.groupId,
          new InputFile(typeof document === "string" ? Buffer.from(document) : document, filename)
        )
      );
    },
    async sendTemporaryMessage(text, durationMs = 1e4, options) {
      console.log(
        `[Bot] sendTemporaryMessage: "${text.slice(0, 50)}..." (duration: ${durationMs}ms)`
      );
      await sendTemporaryMessage(bot, config.groupId, text, durationMs, queue, options);
    },
    queue
  };
}

// src/config.ts
import { resolve } from "path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: resolve(process.cwd(), ".env") });
function parseAllowedUserIds(value) {
  if (!value || value.trim() === "") {
    return [];
  }
  return value.split(",").map((id) => id.trim()).filter((id) => id !== "").map((id) => Number.parseInt(id, 10)).filter((id) => !Number.isNaN(id));
}
function loadConfig() {
  console.log("[Config] Loading environment configuration...");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
  if (!botToken || botToken.trim() === "") {
    console.error("[Config] Missing TELEGRAM_BOT_TOKEN");
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
  }
  if (!groupId || groupId.trim() === "") {
    console.error("[Config] Missing TELEGRAM_GROUP_ID");
    throw new Error("Missing required environment variable: TELEGRAM_GROUP_ID");
  }
  const parsedGroupId = Number.parseInt(groupId, 10);
  if (Number.isNaN(parsedGroupId)) {
    console.error("[Config] Invalid TELEGRAM_GROUP_ID (not a number)");
    throw new Error("TELEGRAM_GROUP_ID must be a valid number");
  }
  const allowedUserIds = parseAllowedUserIds(allowedUserIdsStr);
  if (allowedUserIds.length === 0) {
    console.error("[Config] Missing or invalid TELEGRAM_ALLOWED_USER_IDS");
    throw new Error(
      "Missing or invalid TELEGRAM_ALLOWED_USER_IDS (must be comma-separated numeric user IDs)"
    );
  }
  const audioApiKey = process.env.AUDIO_TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  let audioProvider = null;
  if (audioApiKey) {
    audioProvider = audioApiKey.startsWith("sk-") ? "openai" : "gemini";
    console.log(`[Config] Audio transcription enabled with ${audioProvider}`);
  } else {
    console.log("[Config] Audio transcription disabled (no API key)");
  }
  console.log(
    `[Config] Configuration loaded: groupId=${parsedGroupId}, allowedUsers=${allowedUserIds.length}`
  );
  return {
    botToken,
    groupId: parsedGroupId,
    allowedUserIds,
    audioTranscriptionApiKey: audioApiKey,
    audioTranscriptionProvider: audioProvider
  };
}

// src/lib/config.ts
var SERVICE_NAME = "TelegramRemote";

// src/lib/logger.ts
function log(client, level, message, extra) {
  client.app.log({
    body: {
      service: SERVICE_NAME,
      level,
      message,
      extra
    }
  }).catch(() => {
  });
}
function createLogger(client) {
  return {
    debug: (message, extra) => log(client, "debug", message, extra),
    info: (message, extra) => log(client, "info", message, extra),
    warn: (message, extra) => log(client, "warn", message, extra),
    error: (message, extra) => log(client, "error", message, extra)
  };
}

// src/events/message-part-updated.ts
async function handleMessagePartUpdated(event, context) {
  const logger = createLogger(context.client);
  const part = event.properties.part;
  if (part.type === "text") {
    const text = part.text;
    context.globalStateStore.setLastMessagePartUpdate(text);
    if (typeof event.properties.delta !== "undefined" && event.properties.delta !== null) {
      if (part.sessionID) {
        try {
          context.globalStateStore.setLastUpdate(part.sessionID, text);
          context.globalStateStore.setLastUpdateDelta(part.sessionID, event.properties.delta);
          logger.info("Stored lastUpdate and lastUpdateDelta", { sessionID: part.sessionID, delta: event.properties.delta });
        } catch (err) {
          logger.warn("Failed to store last update data", { error: String(err) });
        }
      } else {
        logger.warn("Delta message received but missing sessionID");
      }
    }
    if (part.time && typeof part.time.end !== "undefined" && part.time.end !== null) {
      try {
        await context.bot.sendMessage(text);
        if (part.sessionID) {
          try {
            context.globalStateStore.setLastSendFinalMessage(part.sessionID, text);
            logger.info("Stored lastSendFinalMessage", { sessionID: part.sessionID });
          } catch (err) {
            logger.warn("Failed to store lastSendFinalMessage", { error: String(err) });
          }
        }
        logger.info("Message part sent to Telegram", { text: text.substring(0, 100) });
      } catch (error) {
        logger.error("Failed to send message part to Telegram", { error: String(error) });
      }
    }
  }
}

// src/events/message-updated.ts
async function handleMessageUpdated(event, context) {
}

// src/events/question-asked.ts
import { InlineKeyboard as InlineKeyboard4 } from "grammy";
async function handleQuestionAsked(event, context) {
  const { id: questionId, sessionID, questions } = event.properties;
  console.log(`[TelegramRemote] Question asked: ${questionId} (${questions.length} questions)`);
  context.questionTracker.createQuestionSession(questionId, sessionID, questions);
  await sendQuestion(context, questionId, 0);
}
async function sendQuestion(context, questionId, index) {
  const session = context.questionTracker.getActiveQuestionSession(questionId);
  if (!session || index >= session.questions.length) {
    return;
  }
  const question = session.questions[index];
  const isMultiple = question.multiple ?? false;
  const currentAnswers = session.answers[index] || [];
  const keyboard = new InlineKeyboard4();
  question.options.forEach((option, optionIndex) => {
    const isSelected = currentAnswers.includes(option.label);
    const icon = isMultiple ? isSelected ? "\u2611 " : "\u2610 " : "";
    keyboard.text(`${icon}${option.label}`, `q:${questionId}:${index}:${optionIndex}`).row();
  });
  if (isMultiple) {
    keyboard.text("Done", `q:${questionId}:${index}:done`);
  }
  const messageText = `\u2753 *${question.header}*

${question.question}

${question.options.map((o) => `\u2022 *${o.label}*: ${o.description}`).join("\n")}`;
  const result = await context.bot.sendMessage(messageText, {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
  if (session) {
    session.telegramMessageIds.push(result.message_id);
    context.questionTracker.updateQuestionSession(questionId, session);
  }
}

// src/events/session-created.ts
async function handleSessionCreated(event, context) {
  const sessionId = event.properties.info.id;
  console.log(`[TelegramRemote] Session created: ${sessionId.slice(0, 8)}`);
  context.globalStateStore.setActiveSession(sessionId);
  await context.bot.sendTemporaryMessage(`\u2705 Session initialized: ${sessionId.slice(0, 8)}`, 1e4);
}

// src/events/session-status.ts
async function handleSessionStatus(event, context) {
  const statusType = event?.properties?.status?.type;
  if (statusType && context.globalStateStore) {
    context.globalStateStore.setSessionStatus(statusType);
    console.log(`[TelegramRemote] Session status updated: ${statusType}`);
    if (statusType === "idle") {
      console.log(`[TelegramRemote] Session is idle. Sending finished notification.`);
      try {
        await context.bot.sendTemporaryMessage("Agent has finished.");
      } catch (error) {
        console.error("[TelegramRemote] Failed to send idle notification:", error);
      }
    }
    if (statusType === "completed") {
      const lastResponse = context.globalStateStore.getLastResponse();
      const lastSent = context.globalStateStore.getLastResponseSentContent();
      if (lastResponse && lastResponse !== lastSent) {
        console.log(`[TelegramRemote] Session completed. Sending final response.`);
        context.globalStateStore.setLastResponseSentContent(lastResponse);
        try {
          const lines = lastResponse.split("\n");
          if (lines.length > 100) {
            await context.bot.sendDocument(lastResponse, "response.md");
          } else {
            await context.bot.sendMessage(lastResponse);
          }
        } catch (error) {
          console.error("[TelegramRemote] Failed to send final response:", error);
        }
      } else if (!lastResponse) {
        console.log(`[TelegramRemote] Session completed but no last response found.`);
        await context.bot.sendTemporaryMessage("Task completed.");
      } else {
        console.log(`[TelegramRemote] Session completed. Last response already sent.`);
      }
    }
  }
}

// src/events/session-updated.ts
async function handleSessionUpdated(event, context) {
  const title = event?.properties?.info?.title;
  const sessionId = event?.properties?.info?.id ?? event?.properties?.id;
  if (title && context.globalStateStore) {
    if (typeof sessionId === "string" && sessionId.trim()) {
      context.globalStateStore.setCurrentSessionTitleForSession(sessionId, title);
    } else {
      context.globalStateStore.setCurrentSessionTitle(title);
    }
    console.log(`[TelegramRemote] Session title updated: ${title}`);
  }
}

// src/events/todo-updated.ts
async function handleTodoUpdated(event, context) {
  const todos = event?.properties?.todos;
  if (!todos) {
    return;
  }
  context.globalStateStore.setTodos(todos);
  console.log(`[TelegramRemote] Todos updated: ${todos.length}`);
}

// src/global-state-store.ts
var GlobalStateStore = class {
  events = [];
  allowedEventTypes;
  availableAgents = [];
  currentAgent = null;
  currentSessionTitle = null;
  sessionStatus = null;
  lastMessagePartUpdate = null;
  lastResponse = null;
  lastResponseSentContent = null;
  // Map storing the last sent final message per sessionID
  lastSendFinalMessage = /* @__PURE__ */ new Map();
  // Map storing the last update text per sessionID when delta updates arrive
  lastUpdate = /* @__PURE__ */ new Map();
  // Map storing the last delta payload per sessionID
  lastUpdateDelta = /* @__PURE__ */ new Map();
  todos = [];
  activeSessionId = null;
  sessionTitles = /* @__PURE__ */ new Map();
  constructor(allowedEventTypes) {
    this.allowedEventTypes = new Set(allowedEventTypes);
  }
  // Session tracking methods
  setActiveSession(sessionId) {
    this.activeSessionId = sessionId;
  }
  setSessionTitle(sessionId, title) {
    this.sessionTitles.set(sessionId, title);
  }
  getSessionTitle(sessionId) {
    return this.sessionTitles.get(sessionId) ?? null;
  }
  getActiveSession() {
    return this.activeSessionId;
  }
  clearActiveSession() {
    this.activeSessionId = null;
  }
  addEvent(type, data) {
    if (this.allowedEventTypes.has(type)) {
      this.events.push({
        type,
        data,
        timestamp: Date.now()
      });
    }
  }
  getEvents(type) {
    if (type) {
      return this.events.filter((e) => e.type === type);
    }
    return [...this.events];
  }
  clearEvents(type) {
    const initialCount = this.events.length;
    if (type) {
      this.events = this.events.filter((e) => e.type !== type);
    } else {
      this.events = [];
    }
    return initialCount - this.events.length;
  }
  setAgents(agents) {
    this.availableAgents = agents;
  }
  getAgents() {
    return this.availableAgents;
  }
  setCurrentAgent(agent) {
    this.currentAgent = agent;
  }
  getCurrentAgent() {
    return this.currentAgent;
  }
  setCurrentSessionTitle(title) {
    this.currentSessionTitle = title;
  }
  getCurrentSessionTitle() {
    return this.currentSessionTitle;
  }
  setCurrentSessionTitleForSession(sessionId, title) {
    this.currentSessionTitle = title;
    this.sessionTitles.set(sessionId, title);
  }
  setSessionStatus(status) {
    this.sessionStatus = status;
  }
  getSessionStatus() {
    return this.sessionStatus;
  }
  setLastMessagePartUpdate(text) {
    this.lastMessagePartUpdate = text;
  }
  getLastMessagePartUpdate() {
    return this.lastMessagePartUpdate;
  }
  setLastResponse(text) {
    this.lastResponse = text;
  }
  getLastResponse() {
    return this.lastResponse;
  }
  setLastResponseSentContent(text) {
    this.lastResponseSentContent = text;
  }
  getLastResponseSentContent() {
    return this.lastResponseSentContent;
  }
  setLastSendFinalMessage(sessionId, text) {
    if (!sessionId) return;
    this.lastSendFinalMessage.set(sessionId, text);
  }
  getLastSendFinalMessage(sessionId) {
    return this.lastSendFinalMessage.get(sessionId) ?? null;
  }
  setLastUpdate(sessionId, text) {
    if (!sessionId) return;
    this.lastUpdate.set(sessionId, text);
  }
  getLastUpdate(sessionId) {
    return this.lastUpdate.get(sessionId) ?? null;
  }
  setLastUpdateDelta(sessionId, delta) {
    if (!sessionId) return;
    this.lastUpdateDelta.set(sessionId, delta);
  }
  getLastUpdateDelta(sessionId) {
    return this.lastUpdateDelta.get(sessionId) ?? null;
  }
  setTodos(todos) {
    this.todos = [...todos];
  }
  getTodos() {
    return [...this.todos];
  }
};

// src/question-tracker.ts
var QuestionTracker = class {
  sessions = /* @__PURE__ */ new Map();
  createQuestionSession(questionId, sessionId, questions) {
    const sessionState = {
      questionId,
      sessionId,
      questions,
      currentQuestionIndex: 0,
      answers: [],
      telegramMessageIds: [],
      createdAt: /* @__PURE__ */ new Date()
    };
    this.sessions.set(questionId, sessionState);
  }
  getActiveQuestionSession(questionId) {
    return this.sessions.get(questionId);
  }
  updateQuestionSession(questionId, state) {
    this.sessions.set(questionId, state);
  }
  clearQuestionSession(questionId) {
    this.sessions.delete(questionId);
  }
  recordAnswer(questionId, questionIndex, answer) {
    const session = this.sessions.get(questionId);
    if (session) {
      while (session.answers.length <= questionIndex) {
        session.answers.push([]);
      }
      session.answers[questionIndex] = answer;
      this.updateQuestionSession(questionId, session);
    }
  }
  getCurrentQuestionIndex(questionId) {
    return this.sessions.get(questionId)?.currentQuestionIndex;
  }
};

// src/telegram-remote.ts
var TelegramRemote = async ({ client }) => {
  console.log("[TelegramRemote] Plugin initialization started");
  const logger = createLogger(client);
  let config;
  try {
    console.log("[TelegramRemote] Loading configuration...");
    config = loadConfig();
    console.log("[TelegramRemote] Configuration loaded successfully");
  } catch (error) {
    console.error("[TelegramRemote] Configuration error:", error);
    logger.error(`Configuration error: ${error}`);
    return {
      event: async () => {
      }
    };
  }
  console.log("[TelegramRemote] Creating global state store and question tracker...");
  const questionTracker = new QuestionTracker();
  const globalStateStore = new GlobalStateStore([
    "file.edited",
    "session.updated",
    "session.status",
    "message.part.updated",
    "message.updated",
    "todo.updated"
  ]);
  console.log("[TelegramRemote] Creating Telegram bot...");
  const bot = createTelegramBot(config, client, logger, globalStateStore, questionTracker);
  console.log("[TelegramRemote] Bot created successfully");
  console.log("[TelegramRemote] Starting Telegram bot polling...");
  bot.start().catch((error) => {
    console.error("[TelegramRemote] Failed to start bot:", error);
    logger.error("Failed to start bot", { error: String(error) });
  });
  let isShuttingDown = false;
  process.on("SIGINT", async () => {
    if (isShuttingDown) {
      console.log("[TelegramRemote] Force exit...");
      process.exit(1);
    }
    isShuttingDown = true;
    console.log("[TelegramRemote] Received SIGINT, stopping bot...");
    try {
      await bot.stop();
      console.log("[TelegramRemote] Bot stopped successfully, exiting...");
      process.exit(0);
    } catch (error) {
      console.error("[TelegramRemote] Error stopping bot:", error);
      process.exit(1);
    }
  });
  process.on("SIGTERM", async () => {
    if (isShuttingDown) {
      console.log("[TelegramRemote] Force exit...");
      process.exit(1);
    }
    isShuttingDown = true;
    console.log("[TelegramRemote] Received SIGTERM, stopping bot...");
    try {
      await bot.stop();
      console.log("[TelegramRemote] Bot stopped successfully, exiting...");
      process.exit(0);
    } catch (error) {
      console.error("[TelegramRemote] Error stopping bot:", error);
      process.exit(1);
    }
  });
  console.log("[TelegramRemote] Plugin initialization complete, returning event handler");
  const eventContext = {
    client,
    bot,
    globalStateStore,
    questionTracker
  };
  const eventHandlers = {
    "session.created": handleSessionCreated,
    "message.updated": handleMessageUpdated,
    "message.part.updated": handleMessagePartUpdated,
    "session.updated": handleSessionUpdated,
    "session.status": handleSessionStatus,
    "question.asked": handleQuestionAsked,
    "todo.updated": handleTodoUpdated
  };
  return {
    event: async ({ event }) => {
      globalStateStore.addEvent(event.type, event);
      const handler = eventHandlers[event.type];
      if (handler) {
        await handler(event, eventContext);
      }
    }
  };
};
export {
  TelegramRemote
};
