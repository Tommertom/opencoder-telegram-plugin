import type { TodoItem } from "../global-state-store.js";
import type { EventHandlerContext } from "./types.js";

interface TodoUpdatedEvent {
  type: "todo.updated";
  properties: {
    sessionID: string;
    todos: TodoItem[];
  };
}

export async function handleTodoUpdated(
  event: TodoUpdatedEvent,
  context: EventHandlerContext,
): Promise<void> {
  const todos = event?.properties?.todos;
  if (!todos) {
    return;
  }

  context.globalStateStore.setTodos(todos);
  console.log(`[TelegramRemote] Todos updated: ${todos.length}`);
}
