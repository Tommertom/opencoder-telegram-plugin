import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { formatDuration } from "../../lib/format-duration";
import { sendTelegramMessage } from "../../lib/telegram";
import type { Env } from "../../lib/types";
import { getUserByKey } from "../users/service";
import { notifyRequestSchema } from "./schemas";

const notify = new Hono<{ Bindings: Env }>();

function buildNotificationMessage(
  projectName: string,
  sessionTitle?: string,
  durationMs?: number,
): string {
  const lines: string[] = [];

  lines.push(`📁 \`${projectName}\``);

  if (sessionTitle) {
    lines.push(`📋 \`${sessionTitle}\``);
  }

  if (durationMs !== undefined) {
    lines.push(`⏱️${formatDuration(durationMs)}`);
  }

  return lines.join("\n");
}

notify.post(
  "/notify",
  zValidator("json", notifyRequestSchema, (result, c) => {
    if (!result.success) {
      const firstError = result.error.issues[0];
      return c.json({ success: false, error: firstError?.message || "Invalid request" }, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    const userData = await getUserByKey(c.env.USERS, body.key);
    if (!userData) {
      return c.json({ success: false, error: "Invalid key" }, 401);
    }

    const projectName = body.project || "Unknown project";
    const message =
      body.message || buildNotificationMessage(projectName, body.sessionTitle, body.durationMs);

    const success = await sendTelegramMessage(c.env.BOT_TOKEN, userData.chatId, message);

    return c.json({ success });
  },
);

notify.get("/notify", (c) => {
  return c.text("Method not allowed", 405);
});

export { notify as notifyRouter };
