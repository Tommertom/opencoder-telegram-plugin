import type { Agent } from "@opencode-ai/sdk/v2";

export interface StoredEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface TodoItem {
  content: string;
  status: "pending" | "completed" | "cancelled" | "in_progress";
  priority: "low" | "medium" | "high";
  id: string;
}

export class GlobalStateStore {
  private events: StoredEvent[] = [];
  private allowedEventTypes: Set<string>;
  private availableAgents: Agent[] = [];
  private currentAgent: string | null = null;
  private currentSessionTitle: string | null = null;
  private sessionStatus: string | null = null;
  private lastMessagePartUpdate: string | null = null;
  private lastResponse: string | null = null;
  private lastResponseSentContent: string | null = null;
  // Map storing the last sent final message per sessionID
  public lastSendFinalMessage: Map<string, string> = new Map();
  // Map storing the last update text per sessionID when delta updates arrive
  public lastUpdate: Map<string, string> = new Map();
  // Map storing the last delta payload per sessionID
  public lastUpdateDelta: Map<string, string> = new Map();
  private todos: TodoItem[] = [];
  private activeSessionId: string | null = null;
  private activeChatId: number | null = null;
  private sessionTitles: Map<string, string> = new Map();

  constructor(allowedEventTypes: string[]) {
    this.allowedEventTypes = new Set(allowedEventTypes);
  }

  // Session tracking methods
  setActiveSession(sessionId: string): void {
    this.activeSessionId = sessionId;
  }

  setSessionTitle(sessionId: string, title: string): void {
    this.sessionTitles.set(sessionId, title);
  }

  getSessionTitle(sessionId: string): string | null {
    return this.sessionTitles.get(sessionId) ?? null;
  }

  getActiveSession(): string | null {
    return this.activeSessionId;
  }

  setActiveChatId(chatId: number): void {
    this.activeChatId = chatId;
  }

  getActiveChatId(): number | null {
    return this.activeChatId;
  }

  clearActiveChatId(): void {
    this.activeChatId = null;
  }

  clearActiveSession(): void {
    this.activeSessionId = null;
  }

  addEvent(type: string, data: unknown): void {
    if (this.allowedEventTypes.has(type)) {
      this.events.push({
        type,
        data,
        timestamp: Date.now(),
      });
    }
  }

  getEvents(type?: string): StoredEvent[] {
    if (type) {
      return this.events.filter((e) => e.type === type);
    }
    return [...this.events];
  }

  clearEvents(type?: string): number {
    const initialCount = this.events.length;
    if (type) {
      this.events = this.events.filter((e) => e.type !== type);
    } else {
      this.events = [];
    }
    return initialCount - this.events.length;
  }

  setAgents(agents: Agent[]): void {
    this.availableAgents = agents;
  }

  getAgents(): Agent[] {
    return this.availableAgents;
  }

  setCurrentAgent(agent: string): void {
    this.currentAgent = agent;
  }

  getCurrentAgent(): string | null {
    return this.currentAgent;
  }

  setCurrentSessionTitle(title: string): void {
    this.currentSessionTitle = title;
  }

  getCurrentSessionTitle(): string | null {
    return this.currentSessionTitle;
  }

  setCurrentSessionTitleForSession(sessionId: string, title: string): void {
    this.currentSessionTitle = title;
    this.sessionTitles.set(sessionId, title);
  }

  setSessionStatus(status: string): void {
    this.sessionStatus = status;
  }

  getSessionStatus(): string | null {
    return this.sessionStatus;
  }

  setLastMessagePartUpdate(text: string): void {
    this.lastMessagePartUpdate = text;
  }

  getLastMessagePartUpdate(): string | null {
    return this.lastMessagePartUpdate;
  }

  setLastResponse(text: string): void {
    this.lastResponse = text;
  }

  getLastResponse(): string | null {
    return this.lastResponse;
  }

  setLastResponseSentContent(text: string): void {
    this.lastResponseSentContent = text;
  }

  getLastResponseSentContent(): string | null {
    return this.lastResponseSentContent;
  }

  setLastSendFinalMessage(sessionId: string, text: string): void {
    if (!sessionId) return;
    this.lastSendFinalMessage.set(sessionId, text);
  }

  getLastSendFinalMessage(sessionId: string): string | null {
    return this.lastSendFinalMessage.get(sessionId) ?? null;
  }

  setLastUpdate(sessionId: string, text: string): void {
    if (!sessionId) return;
    this.lastUpdate.set(sessionId, text);
  }

  getLastUpdate(sessionId: string): string | null {
    return this.lastUpdate.get(sessionId) ?? null;
  }

  setLastUpdateDelta(sessionId: string, delta: string): void {
    if (!sessionId) return;
    this.lastUpdateDelta.set(sessionId, delta);
  }

  getLastUpdateDelta(sessionId: string): string | null {
    return this.lastUpdateDelta.get(sessionId) ?? null;
  }

  setTodos(todos: TodoItem[]): void {
    this.todos = [...todos];
  }

  getTodos(): TodoItem[] {
    return [...this.todos];
  }
}
