import { readFile, unlink } from "node:fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { createPartFromUri, createUserContent, GoogleGenAI } from "@google/genai";
import { experimental_transcribe as transcribe } from "ai";
import type { Logger } from "../lib/logger.js";

export type TranscriptionProvider = "openai" | "gemini";

export interface TranscriptionConfig {
  apiKey: string;
  provider: TranscriptionProvider;
}

export interface TranscriptionResult {
  text: string;
  error?: string;
}

/**
 * Transcribe audio file using OpenAI Whisper
 */
async function transcribeWithOpenAI(
  audioFilePath: string,
  apiKey: string,
  logger: Logger,
): Promise<TranscriptionResult> {
  try {
    const audioBuffer = await readFile(audioFilePath);
    const openaiProvider = createOpenAI({ apiKey });

    const { text } = await transcribe({
      model: openaiProvider.transcription("whisper-1"),
      audio: audioBuffer,
    });

    return { text };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("OpenAI transcription failed", { error: errorMessage });
    return { text: "", error: errorMessage };
  }
}

/**
 * Transcribe audio file using Google Gemini
 */
async function transcribeWithGemini(
  audioFilePath: string,
  apiKey: string,
  mimeType: string,
  logger: Logger,
): Promise<TranscriptionResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });

    // Upload file to Gemini
    const uploadedFile = await ai.files.upload({
      file: audioFilePath,
      config: { mimeType },
    });

    if (!uploadedFile.uri) {
      throw new Error("Failed to get URI for uploaded file");
    }

    // Generate transcription
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri || "", uploadedFile.mimeType || "audio/ogg"),
        "Transcribe this audio file. Return only the transcribed text without any additional formatting, explanations, or markdown.",
      ]),
    });

    const text = response.text || "";
    return { text };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Gemini transcription failed", { error: errorMessage });
    return { text: "", error: errorMessage };
  }
}

/**
 * Main transcription function - routes to appropriate provider
 */
export async function transcribeAudio(
  audioFilePath: string,
  config: TranscriptionConfig,
  mimeType: string,
  logger: Logger,
): Promise<TranscriptionResult> {
  logger.info("Starting audio transcription", {
    provider: config.provider,
    mimeType,
  });

  const result =
    config.provider === "openai"
      ? await transcribeWithOpenAI(audioFilePath, config.apiKey, logger)
      : await transcribeWithGemini(audioFilePath, config.apiKey, mimeType, logger);

  // Clean up temp file
  try {
    await unlink(audioFilePath);
    logger.debug("Cleaned up audio file", { audioFilePath });
  } catch (error) {
    logger.warn("Failed to clean up audio file", { error: String(error) });
  }

  return result;
}
