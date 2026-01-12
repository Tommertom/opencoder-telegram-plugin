import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const src = "dist/telegram-remote.js";
const dest = "../.opencode/plugin/telegram-remote.js";

try {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`Copied ${src} to ${dest}`);
} catch (error) {
  console.error(`Failed to copy file: ${error.message}`);
  process.exit(1);
}
