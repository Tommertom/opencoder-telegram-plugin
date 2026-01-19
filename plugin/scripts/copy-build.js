import { cpSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const src = "dist";
const dest = "../.opencode/plugin";

try {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`Copied ${src} to ${dest}`);
} catch (error) {
  console.error(`Failed to copy files: ${error.message}`);
  process.exit(1);
}
