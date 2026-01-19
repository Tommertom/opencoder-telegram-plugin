import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context } from "grammy";
import { transcribeAudio } from "../lib/audio-transcription.js";
import type { CommandDeps } from "./types.js";

const SUPPORTED_FORMATS = [
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/m4a",
  "audio/flac",
  "audio/opus",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function createAudioMessageHandler({
  config,
  client,
  logger,
  globalStateStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] Audio/voice message received");

    // Check if transcription is enabled
    if (!config.audioTranscriptionApiKey || !config.audioTranscriptionProvider) {
      await ctx.reply(
        "🎙️ Voice transcription is not configured. Please add AUDIO_TRANSCRIPTION_API_KEY to .env",
      );
      return;
    }

    if (ctx.chat?.type !== "private") return;

    // Get audio file info
    const voice = ctx.message?.voice;
    const audio = ctx.message?.audio;
    const fileToDownload = voice || audio;

    if (!fileToDownload) {
      await ctx.reply("❌ No audio file found in message");
      return;
    }

    // Validate file size
    if (fileToDownload.file_size && fileToDownload.file_size > MAX_FILE_SIZE) {
      await ctx.reply("❌ Audio file too large (max 25MB)");
      return;
    }

    // Validate MIME type
    const mimeType = fileToDownload.mime_type || "audio/ogg";
    if (!SUPPORTED_FORMATS.includes(mimeType)) {
      await ctx.reply(`❌ Unsupported audio format: ${mimeType}`);
      return;
    }

    try {
      // Download the file
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

      // Create temp directory
      const tempDir = join(tmpdir(), "opencode-audio");
      await mkdir(tempDir, { recursive: true });

      // Download to temp file
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

      // Send "processing" message
      const processingMsg = await ctx.reply("🎙️ Transcribing audio...");

      // Transcribe
      const result = await transcribeAudio(
        tempFilePath,
        {
          apiKey: config.audioTranscriptionApiKey,
          provider: config.audioTranscriptionProvider,
        },
        mimeType,
        logger,
      );

      // Delete processing message
      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }

      if (result.error || !result.text.trim()) {
        await ctx.reply(`❌ Transcription failed: ${result.error || "Empty transcription"}`);
        return;
      }

      logger.info("Transcription successful", { textLength: result.text.length });

      // Prompt Mode: Send directly to OpenCode session
      let sessionId = globalStateStore.getActiveSession();

      if (!sessionId) {
        // Auto-create session
        const createSessionResponse = await client.session.create({ body: {} });
        if (createSessionResponse.error) {
          logger.error("Failed to create session", { error: createSessionResponse.error });
          await ctx.reply("❌ Failed to initialize session for voice transcription");
          return;
        }

        sessionId = createSessionResponse.data.id;
        globalStateStore.setActiveSession(sessionId);
        logger.info("Auto-created session for voice message", { sessionId });
      }

      // Send transcribed text as prompt
      const currentAgent = globalStateStore.getCurrentAgent();
      const promptResponse = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: result.text }],
          agent: currentAgent || undefined,
        },
      });

      if (promptResponse.error) {
        logger.error("Failed to send transcription to OpenCode", {
          error: promptResponse.error,
        });
        await ctx.reply("❌ Failed to send transcription to OpenCode");
        return;
      }

      await ctx.reply(`✅ Transcribed and sent:\n\`${result.text}\``, {
        parse_mode: "Markdown",
      });

      logger.debug("Sent transcription to OpenCode", { sessionId });
    } catch (error) {
      logger.error("Audio message handling failed", { error: String(error) });
      await ctx.reply(`❌ Failed to process audio: ${String(error)}`);
    }
  };
}
