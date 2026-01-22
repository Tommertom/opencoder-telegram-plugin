/**
 * OpenCoder Telegram Remote Plugin
 * https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin
 */

// src/bot.ts
import { Bot, InputFile } from "grammy";

// src/callbacks/agents-callback.command.ts
var createAgentsCallbackHandler = (deps) => async (ctx) => {
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;
  if (ctx.chat?.type !== "private") return;
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("agent:")) return;
  const agentName = data.replace("agent:", "");
  if (!agentName) return;
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

// src/callbacks/models-callback.command.ts
var createModelsCallbackHandler = (deps) => async (ctx) => {
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;
  if (ctx.chat?.type !== "private") return;
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("model:")) return;
  const modelId = data.replace("model:", "");
  if (!modelId) return;
  try {
    const result = await deps.client.config.update({
      body: {
        model: modelId
      }
    });
    if (result.error) {
      throw new Error(String(result.error));
    }
    await ctx.answerCallbackQuery({ text: `Active model set to ${modelId}` });
    try {
      await ctx.editMessageText(`\u2705 Active model set to *${modelId}*`, {
        parse_mode: "Markdown"
      });
    } catch (error) {
      await deps.bot.sendTemporaryMessage(`\u2705 Active model set to ${modelId}`, 3e3);
    }
  } catch (error) {
    deps.logger.error("Failed to set model", { error: String(error) });
    await ctx.answerCallbackQuery({ text: "Failed to set model." });
  }
};

// src/callbacks/sessions-callback.command.ts
var createSessionsCallbackHandler = (deps) => async (ctx) => {
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) return;
  if (ctx.chat?.type !== "private") return;
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("session:")) return;
  const sessionId = data.replace("session:", "");
  if (!sessionId) return;
  deps.globalStateStore.setCurrentSession(sessionId);
  const sessionTitle = deps.globalStateStore.getSessionTitle(sessionId) || sessionId;
  await ctx.answerCallbackQuery({ text: `Active session set to ${sessionTitle}` });
  try {
    await ctx.editMessageText(`\u2705 Active session set to *${sessionTitle}*`, {
      parse_mode: "Markdown"
    });
  } catch (error) {
    await deps.bot.sendTemporaryMessage(`\u2705 Active session set to ${sessionTitle}`, 3e3);
  }
};

// src/commands/agents.ts
import { InlineKeyboard } from "grammy";
function createAgentsCommandHandler({
  config,
  client,
  logger,
  bot,
  globalStateStore
}) {
  return async (ctx) => {
    console.log("[Bot] /agents command received");
    if (ctx.chat?.type !== "private") return;
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
      const internalAgentNames = ["title", "compaction", "summary"];
      const primaryAgents = agents.filter(
        (a) => a.mode === "primary" && !a.builtIn && !internalAgentNames.includes(a.name.toLowerCase())
      );
      globalStateStore.setAgents(primaryAgents);
      if (defaultAgent && primaryAgents.some((agent) => agent.name === defaultAgent)) {
        globalStateStore.setCurrentAgent(defaultAgent);
      }
      if (primaryAgents.length === 0) {
        await bot.sendTemporaryMessage("No primary agents found.");
        return;
      }
      const keyboard = new InlineKeyboard();
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

// src/commands/audio-message.command.ts
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// src/services/audio-transcription.service.ts
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
      model: "gemini-3-flash-preview",
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
function createAudioMessageHandler(deps) {
  const { config, client, logger, globalStateStore } = deps;
  return async (ctx) => {
    console.log("[Bot] Audio/voice message received");
    if (!config.audioTranscriptionApiKey || !config.audioTranscriptionProvider) {
      await deps.queue.enqueue(
        () => ctx.reply(
          "\u{1F399}\uFE0F Voice transcription is not configured. Please add AUDIO_TRANSCRIPTION_API_KEY to .env"
        )
      );
      return;
    }
    if (ctx.chat?.type !== "private") return;
    const voice = ctx.message?.voice;
    const audio = ctx.message?.audio;
    const fileToDownload = voice || audio;
    if (!fileToDownload) {
      await deps.queue.enqueue(() => ctx.reply("\u274C No audio file found in message"));
      return;
    }
    if (fileToDownload.file_size && fileToDownload.file_size > MAX_FILE_SIZE) {
      await deps.queue.enqueue(() => ctx.reply("\u274C Audio file too large (max 25MB)"));
      return;
    }
    const mimeType = fileToDownload.mime_type || "audio/ogg";
    if (!SUPPORTED_FORMATS.includes(mimeType)) {
      await deps.queue.enqueue(() => ctx.reply(`\u274C Unsupported audio format: ${mimeType}`));
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
      const processingMsg = await deps.queue.enqueue(() => ctx.reply("\u{1F399}\uFE0F Transcribing audio..."));
      const result = await transcribeAudio(
        tempFilePath,
        {
          apiKey: config.audioTranscriptionApiKey,
          provider: config.audioTranscriptionProvider
        },
        mimeType,
        logger
      );
      if (ctx.chat?.id) {
        await deps.queue.enqueue(
          () => ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id)
        );
      }
      if (result.error || !result.text.trim()) {
        await deps.queue.enqueue(
          () => ctx.reply(`\u274C Transcription failed: ${result.error || "Empty transcription"}`)
        );
        return;
      }
      logger.info("Transcription successful", { textLength: result.text.length });
      let sessionId = globalStateStore.getCurrentSession();
      if (!sessionId) {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await deps.queue.enqueue(
            () => ctx.reply("\u274C Failed to initialize session for voice transcription")
          );
          return;
        }
        sessionId = createSessionResponse.data.id;
        globalStateStore.setCurrentSession(sessionId);
        logger.info("Auto-created session for voice message", { sessionId });
      }
      const currentAgent = globalStateStore.getCurrentAgent();
      const promptResponse = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: result.text }],
          agent: currentAgent || void 0
        }
      });
      if (promptResponse.error) {
        logger.error("Failed to send transcription to OpenCode", {
          error: promptResponse.error
        });
        await deps.queue.enqueue(() => ctx.reply("\u274C Failed to send transcription to OpenCode"));
        return;
      }
      await deps.queue.enqueue(
        () => ctx.reply(`\u2705 Transcribed and sent:
\`${result.text}\``, {
          parse_mode: "Markdown"
        })
      );
      logger.debug("Sent transcription to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Audio message handling failed", { error: String(error) });
      await deps.queue.enqueue(() => ctx.reply(`\u274C Failed to process audio: ${String(error)}`));
    }
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
function createEscCommandHandler(deps) {
  const { config, client, logger, globalStateStore } = deps;
  return async (ctx) => {
    console.log("[Bot] /esc command received");
    if (ctx.chat?.type !== "private") return;
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /esc attempt by unauthorized user ${userId}`);
      await deps.queue.enqueue(
        () => ctx.reply("You are not authorized to use this bot.", getDefaultKeyboardOptions())
      );
      return;
    }
    const sessionId = globalStateStore.getCurrentSession();
    if (!sessionId) {
      await deps.queue.enqueue(
        () => ctx.reply("\u274C No active session. Use /new to create one.", getDefaultKeyboardOptions())
      );
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
        await deps.queue.enqueue(
          () => ctx.reply("\u274C Failed to send escape", getDefaultKeyboardOptions())
        );
        return;
      }
      logger.debug("Sent escape to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Failed to send escape to OpenCode", {
        error: String(error),
        sessionId
      });
      await deps.queue.enqueue(
        () => ctx.reply("\u274C Failed to send escape", getDefaultKeyboardOptions())
      );
    }
  };
}

// src/commands/help.ts
function createHelpCommandHandler(deps) {
  const { config } = deps;
  return async (ctx) => {
    console.log("[Bot] /help command received");
    if (ctx.chat?.type !== "private") return;
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /help attempt by unauthorized user ${userId}`);
      await deps.queue.enqueue(() => ctx.reply("You are not authorized to use this bot."));
      return;
    }
    const helpMessage = "Available commands:\n\n/new - Create a new OpenCode session.\n/projects - List all known projects.\n/sessions - List all active OpenCode sessions.\n/agents - List available agents.\n/todos - Show current todos.\n/tab - Send a Tab key to the active session.\n/esc - Send an Escape key to the active session.\n/help - Show this help message.\n\nUsage:\n- Use /new to create a new session.\n- Use /todos to list the current todos.\n- Send messages in this chat to interact with the active session.\n- Send voice messages or audio files (max 25MB) to transcribe and send them as prompts.\n- Use Tab and Esc buttons or commands to send special keys.\n\nNote: All commands require you to be a configured allowed user. The bot enforces this via its middleware and command-level checks.";
    await deps.queue.enqueue(() => ctx.reply(helpMessage, getDefaultKeyboardOptions()));
  };
}

// src/commands/message-text.command.ts
function createMessageTextHandler(deps) {
  const { config, client, logger, globalStateStore } = deps;
  return async (ctx) => {
    console.log(`[Bot] Text message received: "${ctx.message?.text?.slice(0, 50)}..."`);
    if (ctx.chat?.type !== "private") return;
    if (ctx.message?.text?.startsWith("/")) return;
    let sessionId = globalStateStore.getCurrentSession();
    if (!sessionId) {
      try {
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await deps.queue.enqueue(
            () => ctx.reply("\u274C Failed to initialize session", getDefaultKeyboardOptions())
          );
          return;
        }
        sessionId = createSessionResponse.data.id;
        globalStateStore.setCurrentSession(sessionId);
        logger.info("Auto-created session", {
          sessionId
        });
      } catch (error) {
        logger.error("Failed to create session", { error: String(error) });
        await deps.queue.enqueue(
          () => ctx.reply("\u274C Failed to initialize session", getDefaultKeyboardOptions())
        );
        return;
      }
    }
    const userMessage = ctx.message?.text;
    try {
      const currentAgent = globalStateStore.getCurrentAgent();
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: userMessage || "" }],
          agent: currentAgent || void 0
        }
      });
      if (response.error) {
        logger.error("Failed to send message to OpenCode", {
          error: response.error,
          sessionId
        });
        await deps.queue.enqueue(
          () => ctx.reply("\u274C Failed to process message", getDefaultKeyboardOptions())
        );
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
      await deps.queue.enqueue(
        () => ctx.reply("\u274C Failed to process message", getDefaultKeyboardOptions())
      );
    }
  };
}

// src/commands/models.ts
import { InlineKeyboard as InlineKeyboard2 } from "grammy";
function createModelsCommandHandler({ client, logger, bot, globalStateStore }) {
  return async (ctx) => {
    console.log("[Bot] /models command received");
    if (ctx.chat?.type !== "private") return;
    try {
      const providersResponse = await client.provider.list();
      if (providersResponse.error) {
        logger.error("Failed to list models", { error: providersResponse.error });
        await bot.sendTemporaryMessage("\u274C Failed to list models");
        return;
      }
      const configResponse = await client.config.get();
      let currentModel = "";
      if (configResponse.data) {
        const cfg = configResponse.data;
        currentModel = cfg.model || "";
      }
      const providers = providersResponse.data || [];
      const chatModels = [];
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
      const keyboard = new InlineKeyboard2();
      chatModels.sort((a, b) => {
        if (a.providerID !== b.providerID) {
          return a.providerID.localeCompare(b.providerID);
        }
        return a.name.localeCompare(b.name);
      });
      chatModels.forEach((model) => {
        const modelId = `${model.providerID}/${model.id}`;
        const isSelected = currentModel === modelId ? "\u2705 " : "";
        let displayName = `${model.providerID}: ${model.name}`;
        if (displayName.length > 30) {
          displayName = displayName.substring(0, 27) + "...";
        }
        keyboard.text(`${isSelected}${displayName}`, `model:${modelId}`).row();
      });
      const message = "*Select a model:*";
      await bot.sendTemporaryMessage(message, 6e4, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error("Failed to list models", { error: String(error) });
      await bot.sendTemporaryMessage("\u274C Failed to list models");
    }
  };
}

// src/commands/new.ts
function createNewCommandHandler(deps) {
  const { bot, client, logger, globalStateStore } = deps;
  return async (ctx) => {
    console.log("[Bot] /new command received");
    if (ctx.chat?.type !== "private") return;
    try {
      const createSessionResponse = await client.session.create({ body: {} });
      if (createSessionResponse.error) {
        logger.error("Failed to create session", { error: createSessionResponse.error });
        await deps.queue.enqueue(
          () => ctx.reply("\u274C Failed to create session", getDefaultKeyboardOptions())
        );
        return;
      }
      const sessionId = createSessionResponse.data.id;
      globalStateStore.setCurrentSession(sessionId);
      logger.info("Created new session", {
        sessionId
      });
      await bot.sendMessage(`\u2705 Session created: ${sessionId}`);
    } catch (error) {
      logger.error("Failed to create new session", { error: String(error) });
      await deps.queue.enqueue(
        () => ctx.reply("\u274C Failed to create session", getDefaultKeyboardOptions())
      );
    }
  };
}

// src/commands/projects.ts
function createProjectsCommandHandler({ client, logger, bot }) {
  return async (ctx) => {
    console.log("[Bot] /projects command received");
    if (ctx.chat?.type !== "private") return;
    try {
      const projectsResponse = await client.project.list();
      if (projectsResponse.error) {
        logger.error("Failed to list projects", { error: projectsResponse.error });
        await bot.sendTemporaryMessage("\u274C Failed to list projects");
        return;
      }
      const projects = projectsResponse.data || [];
      if (projects.length === 0) {
        await bot.sendTemporaryMessage("No projects found.");
        return;
      }
      const currentProjectResponse = await client.project.current();
      const currentProject = currentProjectResponse.data;
      const message = projects.map((p, index) => {
        const name = p.worktree.split("/").pop() || p.worktree;
        const isCurrent = p.worktree === currentProject?.worktree;
        const marker = isCurrent ? "\u2605 " : "";
        return `${index + 1}. ${marker}*${name}*
   \`${p.worktree}\``;
      }).join("\n\n");
      await bot.sendMessage(`*Projects (${projects.length})*:

${message}`, {
        parse_mode: "Markdown"
      });
    } catch (error) {
      logger.error("Failed to list projects", { error: String(error) });
      await bot.sendTemporaryMessage("\u274C Failed to list projects");
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
    if (ctx.chat?.type !== "private") return;
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
function createTabCommandHandler(deps) {
  const { config, client, logger, globalStateStore, bot } = deps;
  return async (ctx) => {
    console.log("[Bot] /tab command received");
    if (ctx.chat?.type !== "private") return;
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.includes(userId)) {
      console.log(`[Bot] /tab attempt by unauthorized user ${userId}`);
      await deps.queue.enqueue(
        () => ctx.reply("You are not authorized to use this bot.", getDefaultKeyboardOptions())
      );
      return;
    }
    let agents = globalStateStore.getAgents();
    if (agents.length === 0) {
      try {
        const agentsResponse = await client.app.agents();
        if (agentsResponse.data) {
          const allAgents = agentsResponse.data;
          const internalAgentNames = ["title", "compaction", "summary"];
          const primaryAgents = allAgents.filter(
            (a) => a.mode === "primary" && !a.builtIn && !internalAgentNames.includes(a.name.toLowerCase())
          );
          globalStateStore.setAgents(primaryAgents);
          agents = primaryAgents;
        }
      } catch (err) {
        logger.error("Failed to fetch agents in /tab", { error: String(err) });
      }
    }
    if (agents.length === 0) {
      await bot.sendTemporaryMessage("\u274C No agents available.");
      return;
    }
    const currentAgentName = globalStateStore.getCurrentAgent();
    const currentIndex = agents.findIndex((a) => a.name === currentAgentName);
    const nextIndex = (currentIndex + 1) % agents.length;
    const nextAgent = agents[nextIndex];
    globalStateStore.setCurrentAgent(nextAgent.name);
    await bot.sendTemporaryMessage(`\u{1F504} Active agent: ${nextAgent.name}`);
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
    if (ctx.chat?.type !== "private") return;
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

// src/services/telegram-queue.service.ts
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
function createTelegramBot(config, client, logger, globalStateStore) {
  console.log("[Bot] createTelegramBot called");
  const queue = new TelegramQueue(500);
  if (botInstance) {
    console.log("[Bot] Reusing existing bot instance");
    logger.warn("Bot already initialized, reusing existing instance");
    return createBotManager(botInstance, queue, globalStateStore, logger);
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
    if (ctx.chat?.type !== "private") {
      logger.warn("Ignoring non-private chat", {
        chatId: ctx.chat?.id,
        chatType: ctx.chat?.type
      });
      return;
    }
    if (ctx.chat?.id) {
      globalStateStore.setActiveChatId(ctx.chat.id);
    }
    await next();
  });
  const manager = createBotManager(bot, queue, globalStateStore, logger);
  const commandDeps = {
    bot: manager,
    config,
    client,
    logger,
    globalStateStore,
    queue
  };
  bot.command("new", createNewCommandHandler(commandDeps));
  bot.command("projects", createProjectsCommandHandler(commandDeps));
  bot.command("sessions", createSessionsCommandHandler(commandDeps));
  bot.command("agents", createAgentsCommandHandler(commandDeps));
  bot.command("models", createModelsCommandHandler(commandDeps));
  bot.command("help", createHelpCommandHandler(commandDeps));
  bot.command("tab", createTabCommandHandler(commandDeps));
  bot.command("esc", createEscCommandHandler(commandDeps));
  bot.command("todos", createTodosCommandHandler(commandDeps));
  bot.on("message:text", createMessageTextHandler(commandDeps));
  bot.on("message:voice", createAudioMessageHandler(commandDeps));
  bot.on("message:audio", createAudioMessageHandler(commandDeps));
  bot.callbackQuery(/^agent:/, createAgentsCallbackHandler(commandDeps));
  bot.callbackQuery(/^model:/, createModelsCallbackHandler(commandDeps));
  bot.callbackQuery(/^session:/, createSessionsCallbackHandler(commandDeps));
  bot.catch((error) => {
    console.error("[Bot] Bot error caught:", error);
    logger.error("Bot error", { error: String(error) });
  });
  console.log("[Bot] All handlers registered, returning bot manager");
  return manager;
}
function requireActiveChatId(globalStateStore, logger, action) {
  const chatId = globalStateStore.getActiveChatId();
  if (!chatId) {
    const message = `No active chat available for ${action}. Ask an allowed user to message the bot first.`;
    logger.warn(message);
    throw new Error(message);
  }
  return chatId;
}
function createBotManager(bot, queue, globalStateStore, logger) {
  return {
    async start() {
      console.log("[Bot] start() called - beginning long polling...");
      await bot.start({
        drop_pending_updates: true,
        onStart: async () => {
          console.log("[Bot] Telegram bot polling started successfully");
          try {
            const chatId = globalStateStore.getActiveChatId();
            if (!chatId) {
              console.log("[Bot] No active chat yet; skipping startup message");
              return;
            }
            await sendTemporaryMessage(bot, chatId, "Messaging enabled", 1e3, queue);
            console.log("[Bot] Startup message sent to active chat");
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
      const chatId = requireActiveChatId(globalStateStore, logger, "sendMessage");
      const mergedOptions = {
        ...options,
        reply_markup: options?.reply_markup || createDefaultKeyboard()
      };
      const result = await queue.enqueue(() => bot.api.sendMessage(chatId, text, mergedOptions));
      return { message_id: result.message_id };
    },
    async editMessage(messageId, text) {
      console.log(`[Bot] editMessage ${messageId}: "${text.slice(0, 50)}..."`);
      const chatId = requireActiveChatId(globalStateStore, logger, "editMessage");
      await queue.enqueue(() => bot.api.editMessageText(chatId, messageId, text));
    },
    async deleteMessage(messageId) {
      console.log(`[Bot] deleteMessage ${messageId}`);
      const chatId = requireActiveChatId(globalStateStore, logger, "deleteMessage");
      await queue.enqueue(() => bot.api.deleteMessage(chatId, messageId));
    },
    async sendDocument(document, filename) {
      console.log(`[Bot] sendDocument: filename="${filename}"`);
      const chatId = requireActiveChatId(globalStateStore, logger, "sendDocument");
      await queue.enqueue(
        () => bot.api.sendDocument(
          chatId,
          new InputFile(typeof document === "string" ? Buffer.from(document) : document, filename)
        )
      );
    },
    async sendTemporaryMessage(text, durationMs = 1e4, options) {
      console.log(
        `[Bot] sendTemporaryMessage: "${text.slice(0, 50)}..." (duration: ${durationMs}ms)`
      );
      const chatId = requireActiveChatId(globalStateStore, logger, "sendTemporaryMessage");
      await sendTemporaryMessage(bot, chatId, text, durationMs, queue, options);
    },
    queue
  };
}

// src/config.ts
import { resolve } from "path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: resolve(process.cwd(), ".env") });
var SERVICE_NAME = "TelegramRemote";
function parseAllowedUserIds(value) {
  if (!value || value.trim() === "") {
    return [];
  }
  return value.split(",").map((id) => id.trim()).filter((id) => id !== "").map((id) => Number.parseInt(id, 10)).filter((id) => !Number.isNaN(id));
}
function loadConfig() {
  console.log("[Config] Loading environment configuration...");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS;
  if (!botToken || botToken.trim() === "") {
    console.error("[Config] Missing TELEGRAM_BOT_TOKEN");
    throw new Error("Missing required environment variable: TELEGRAM_BOT_TOKEN");
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
  const finalMessageLineLimitEnv = process.env.TELEGRAM_FINAL_MESSAGE_LINE_LIMIT;
  let finalMessageLineLimit = 100;
  if (finalMessageLineLimitEnv && finalMessageLineLimitEnv.trim() !== "") {
    const parsed = Number.parseInt(finalMessageLineLimitEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      finalMessageLineLimit = parsed;
    } else {
      console.warn("[Config] Invalid TELEGRAM_FINAL_MESSAGE_LINE_LIMIT, using default 100");
    }
  }
  console.log(
    `[Config] Configuration loaded: allowedUsers=${allowedUserIds.length}, finalMessageLineLimit=${finalMessageLineLimit}`
  );
  return {
    botToken,
    allowedUserIds,
    finalMessageLineLimit,
    audioTranscriptionApiKey: audioApiKey,
    audioTranscriptionProvider: audioProvider
  };
}

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
  if (!part || typeof part.type !== "string") {
    logger.warn("Message part update missing type");
    return;
  }
  if (part.type === "text") {
    const text = part.text;
    context.globalStateStore.setLastMessagePartUpdate(text);
    if (typeof event.properties.delta !== "undefined" && event.properties.delta !== null) {
      if (part.sessionID) {
        try {
          context.globalStateStore.setLastUpdateMessage(part.sessionID, text);
          context.globalStateStore.setLastUpdateDeltaMessage(
            part.sessionID,
            event.properties.delta
          );
          logger.info("Stored lastUpdateMessage and lastUpdateDeltaMessage", {
            sessionID: part.sessionID,
            delta: event.properties.delta
          });
        } catch (err) {
          logger.warn("Failed to store last update data", { error: String(err) });
        }
      } else {
        logger.warn("Delta message received but missing sessionID");
      }
    }
    if (part.time && typeof part.time.end !== "undefined" && part.time.end !== null) {
      try {
        const lineCount = text.split(/\r?\n/).length;
        if (lineCount > context.config.finalMessageLineLimit) {
          await context.bot.sendDocument(text, "response.md");
        } else {
          await context.bot.sendTemporaryMessage(text);
        }
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

// src/events/session-created.ts
async function handleSessionCreated(event, context) {
  const sessionId = event.properties.info.id;
  console.log(`[TelegramRemote] Session created: ${sessionId.slice(0, 8)}`);
  context.globalStateStore.setCurrentSession(sessionId);
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
            await context.bot.sendMessage("Final" + lastResponse);
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
      context.globalStateStore.setSessionTitle(sessionId, title);
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
  trackedEventTypes;
  availableAgents = [];
  currentAgent = null;
  sessionStatus = null;
  lastMessagePartUpdate = null;
  lastResponse = null;
  lastResponseSentContent = null;
  lastSendFinalMessage = /* @__PURE__ */ new Map();
  lastUpdateMessage = /* @__PURE__ */ new Map();
  lastUpdateDeltaMessage = /* @__PURE__ */ new Map();
  todos = [];
  currentSessionId = null;
  activeChatId = null;
  sessionTitles = /* @__PURE__ */ new Map();
  constructor(config) {
    this.trackedEventTypes = new Set(config.trackedEventTypes);
  }
  // Session tracking methods
  setCurrentSession(sessionId) {
    this.currentSessionId = sessionId;
  }
  setSessionTitle(sessionId, title) {
    this.sessionTitles.set(sessionId, title);
  }
  getSessionTitle(sessionId) {
    return this.sessionTitles.get(sessionId) ?? null;
  }
  getCurrentSession() {
    return this.currentSessionId;
  }
  setActiveChatId(chatId) {
    this.activeChatId = chatId;
  }
  getActiveChatId() {
    return this.activeChatId;
  }
  clearActiveChatId() {
    this.activeChatId = null;
  }
  clearCurrentSession() {
    this.currentSessionId = null;
  }
  addEvent(type, data) {
    if (this.trackedEventTypes.has(type)) {
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
  getCurrentSessionTitle() {
    if (!this.currentSessionId) {
      return this.currentSessionId ?? "";
    }
    return this.sessionTitles.get(this.currentSessionId) ?? this.currentSessionId;
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
  setLastUpdateMessage(sessionId, text) {
    if (!sessionId) return;
    this.lastUpdateMessage.set(sessionId, text);
  }
  getLastUpdateMessage(sessionId) {
    return this.lastUpdateMessage.get(sessionId) ?? null;
  }
  setLastUpdateDeltaMessage(sessionId, delta) {
    if (!sessionId) return;
    this.lastUpdateDeltaMessage.set(sessionId, delta);
  }
  getLastUpdateDeltaMessage(sessionId) {
    return this.lastUpdateDeltaMessage.get(sessionId) ?? null;
  }
  setTodos(todos) {
    this.todos = [...todos];
  }
  getTodos() {
    return [...this.todos];
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
  console.log("[TelegramRemote] Creating global state store...");
  const globalStateStore = new GlobalStateStore({
    trackedEventTypes: [
      "file.edited",
      "session.updated",
      "session.status",
      "message.part.updated",
      "message.updated",
      "todo.updated"
    ]
  });
  console.log("[TelegramRemote] Creating Telegram bot...");
  const bot = createTelegramBot(config, client, logger, globalStateStore);
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
    config
  };
  const eventHandlers = {
    "session.created": handleSessionCreated,
    "message.updated": handleMessageUpdated,
    "message.part.updated": handleMessagePartUpdated,
    "session.updated": handleSessionUpdated,
    "session.status": handleSessionStatus,
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
