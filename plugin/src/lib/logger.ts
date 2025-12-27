import { SERVICE_NAME } from "./config";
import type { OpencodeClient } from "./types";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, extra?: Record<string, unknown>) => void;
  info: (message: string, extra?: Record<string, unknown>) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  error: (message: string, extra?: Record<string, unknown>) => void;
}

function log(
  client: OpencodeClient,
  level: LogLevel,
  message: string,
  extra?: Record<string, unknown>,
): void {
  client.app
    .log({
      body: {
        service: SERVICE_NAME,
        level,
        message,
        extra,
      },
    })
    .catch(() => {
      // Silently ignore errors from logging API
    });
}

export function createLogger(client: OpencodeClient): Logger {
  return {
    debug: (message, extra) => log(client, "debug", message, extra),
    info: (message, extra) => log(client, "info", message, extra),
    warn: (message, extra) => log(client, "warn", message, extra),
    error: (message, extra) => log(client, "error", message, extra),
  };
}
