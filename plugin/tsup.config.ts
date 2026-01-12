import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/telegram-remote.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  banner: {
    js: `/**
 * OpenCoder Telegram Remote Plugin
 * https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin
 */`,
  },
  onSuccess: "node scripts/copy-build.js",
});
