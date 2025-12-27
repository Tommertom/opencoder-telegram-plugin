export const INSTALL_KEY = "__INSTALL_KEY__";
export const WORKER_URL = "__WORKER_URL__";
export const SERVICE_NAME = "TelegramNotify";

export function isConfigured(): boolean {
  return !INSTALL_KEY.startsWith("__") && !WORKER_URL.startsWith("__");
}
