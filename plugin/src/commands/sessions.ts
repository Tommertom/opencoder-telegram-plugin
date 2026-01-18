import type { Session } from "@opencode-ai/sdk";
import { type Context, InlineKeyboard } from "grammy";
import type { SessionStore } from "../session-store.js";
import type { CommandDeps } from "./types.js";

type SessionWithArchive = Session & {
  time: Session["time"] & {
    archived?: number;
  };
  properties?: {
    info?: Session & {
      time: Session["time"] & {
        archived?: number;
      };
    };
  };
};

function getSessionInfo(session: SessionWithArchive): SessionWithArchive {
  return session.properties?.info ?? session;
}

function isArchived(session: SessionWithArchive): boolean {
  const info = getSessionInfo(session);
  if (!info.time || !("archived" in info.time)) {
    return false;
  }
  return Boolean(info.time.archived);
}

function getSessionLabel(session: SessionWithArchive, sessionStore: SessionStore): string {
  // First check if we have a stored title for this session
  const storedTitle = sessionStore.getTitle(session.id);
  if (storedTitle) {
    return storedTitle;
  }

  // Fallback to session info title
  const info = getSessionInfo(session);
  const rawTitle = typeof info.title === "string" ? info.title.trim() : "";
  if (rawTitle) {
    return rawTitle;
  }

  // Final fallback to session ID
  const id = info.id ?? session.id ?? "unknown";
  return id;
}

export function createSessionsCommandHandler({
  config,
  client,
  logger,
  bot,
  sessionStore,
}: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /sessions command received");
    if (ctx.chat?.id !== config.groupId) return;

    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    let limit: number | undefined;

    if (arg) {
      if (!/^\d+$/.test(arg)) {
        await bot.sendTemporaryMessage("❌ Invalid argument. Please provide a valid number.");
        return;
      }
      const parsed = Number.parseInt(arg, 10);
      if (parsed <= 0) {
        await bot.sendTemporaryMessage(
          "❌ Invalid argument. Please provide a number greater than 0.",
        );
        return;
      }
      limit = parsed;
    }

    try {
      const sessionsResponse = await client.session.list();

      if (sessionsResponse.error) {
        logger.error("Failed to list sessions", { error: sessionsResponse.error });
        await bot.sendTemporaryMessage("❌ Failed to list sessions");
        return;
      }

      let sessions = (sessionsResponse.data || []) as SessionWithArchive[];
      sessions = sessions.filter((session) => !isArchived(session));

      if (sessions.length === 0) {
        await bot.sendTemporaryMessage("No active sessions found.");
        return;
      }

      if (limit) {
        sessions = sessions.slice(0, limit);
      }

      const keyboard = new InlineKeyboard();
      sessions.forEach((session) => {
        const label = getSessionLabel(session, sessionStore);
        keyboard.text(label, `session:${session.id}`).row();
      });

      const message = `Select an active session (${sessions.length} found):`;
      await bot.sendTemporaryMessage(message, 30000, { reply_markup: keyboard });
    } catch (error) {
      logger.error("Failed to list sessions", { error: String(error) });
      await bot.sendTemporaryMessage("❌ Failed to list sessions");
    }
  };
}
