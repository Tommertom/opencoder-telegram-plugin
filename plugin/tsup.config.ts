import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/telegram-notify.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  banner: {
    js: `/**
 * OpenCode Telegram Notification Plugin
 * https://github.com/Davasny/opencode-telegram-notification-plugin
 */`,
  },
});
