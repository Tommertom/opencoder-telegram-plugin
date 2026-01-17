import type { Agent } from "@opencode-ai/sdk/v2";

export interface StoredEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export class GlobalStateStore {
  private events: StoredEvent[] = [];
  private allowedEventTypes: Set<string>;
  private availableAgents: Agent[] = [];
  private currentAgent: string | null = null;
  private currentSessionTitle: string | null = null;

  constructor(allowedEventTypes: string[]) {
    this.allowedEventTypes = new Set(allowedEventTypes);
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
}
