export interface SessionMapping {
  topicId: number;
  sessionId: string;
}

export class SessionStore {
  private topicToSession = new Map<number, string>();
  private sessionToTopic = new Map<string, number>();
  private topicToPromptMessageId = new Map<number, number>(); // topicId -> Telegram message ID

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

  setPromptMessageId(topicId: number, messageId: number): void {
    this.topicToPromptMessageId.set(topicId, messageId);
  }

  getPromptMessageId(topicId: number): number | undefined {
    return this.topicToPromptMessageId.get(topicId);
  }

  clearPromptMessageId(topicId: number): void {
    this.topicToPromptMessageId.delete(topicId);
  }

  clearAll(): void {
    this.topicToSession.clear();
    this.sessionToTopic.clear();
    this.topicToPromptMessageId.clear();
  }
}
