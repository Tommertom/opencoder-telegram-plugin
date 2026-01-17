import type { Context } from "grammy";
import type { TodoItem } from "../global-state-store.js";
import type { CommandDeps } from "./types.js";

const STATUS_ICONS: Record<TodoItem["status"], string> = {
  pending: "⏳",
  in_progress: "🚧",
  completed: "✅",
  cancelled: "🚫",
};

const PRIORITY_ICONS: Record<TodoItem["priority"], string> = {
  low: "🟢",
  medium: "🟡",
  high: "🔴",
};

function formatTodoLine(todo: TodoItem): string {
  const statusIcon = STATUS_ICONS[todo.status] ?? "⏳";
  const priorityIcon = PRIORITY_ICONS[todo.priority] ?? "🟡";
  const content = todo.content?.trim() || "Untitled todo";
  return `${statusIcon} ${priorityIcon} ${content}`;
}

export function createTodosCommandHandler({ config, bot, globalStateStore }: CommandDeps) {
  return async (ctx: Context) => {
    console.log("[Bot] /todos command received");
    if (ctx.chat?.id !== config.groupId) return;

    const todos = globalStateStore.getTodos();
    if (todos.length === 0) {
      await bot.sendTemporaryMessage("No todos currently available.");
      return;
    }

    const lines = todos.map((todo) => formatTodoLine(todo));
    const message = `Current todos (${todos.length}):\n\n${lines.join("\n")}`;

    await bot.sendTemporaryMessage(message, 30000);
  };
}
