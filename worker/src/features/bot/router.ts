import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Env } from "../../lib/types";
import { handleHelp } from "./handlers/help";
import { handleRevoke } from "./handlers/revoke";
import { handleStart } from "./handlers/start";
import { handleStatus } from "./handlers/status";
import { telegramUpdateSchema } from "./schemas";

const bot = new Hono<{ Bindings: Env }>();

bot.post("/webhook", zValidator("json", telegramUpdateSchema), async (c) => {
  const update = c.req.valid("json");
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();
  const firstName = update.message?.from?.first_name || "N/A";

  if (!chatId) {
    return c.text("OK");
  }

  if (text === "/start") {
    await handleStart(chatId, firstName, c.env);
  } else if (text === "/revoke") {
    await handleRevoke(chatId, firstName, c.env);
  } else if (text === "/status") {
    await handleStatus(chatId, c.env);
  } else if (text === "/help") {
    await handleHelp(chatId, c.env);
  }

  return c.text("OK");
});

export { bot as botRouter };
