export interface SessionMapping {
  topicId: number;
  sessionId: string;
}

export class SessionStore {
  private topicToSession = new Map<number, string>();
  private sessionToTopic = new Map<string, number>();

  create(topicId: number, sessionId: string): void {
    this.topicToSession.set(topicId, sessionId);
    this.sessionToTopic.set(sessionId, topicId);
  }

  getSessionByTopic(topicId: number): string | undefined {
    return this.topicToSession.get(topicId);
  }

  getTopicBySession(sessionId: string): number | undefined {
    return this.sessionToTopic.get(sessionId);
  }

  has(topicId: number): boolean {
    return this.topicToSession.has(topicId);
  }

  getAllTopicIds(): number[] {
    return Array.from(this.topicToSession.keys());
  }

  clearAll(): void {
    this.topicToSession.clear();
    this.sessionToTopic.clear();
  }
}
