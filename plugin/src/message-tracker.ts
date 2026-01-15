export class MessageTracker {
  private userMessages = new Set<string>();
  private assistantMessages = new Set<string>();
  private messageContent = new Map<string, string>();

  markAsUser(messageId: string): void {
    this.userMessages.add(messageId);
    this.assistantMessages.delete(messageId);
    this.messageContent.delete(messageId);
  }

  markAsAssistant(messageId: string): void {
    this.assistantMessages.add(messageId);
    this.userMessages.delete(messageId);
  }

  isAssistant(messageId: string): boolean {
    return this.assistantMessages.has(messageId);
  }

  isUser(messageId: string): boolean {
    return this.userMessages.has(messageId);
  }

  updateContent(messageId: string, content: string): void {
    this.messageContent.set(messageId, content);
  }

  getContent(messageId: string): string | undefined {
    return this.messageContent.get(messageId);
  }

  clearContent(messageId: string): void {
    this.messageContent.delete(messageId);
  }
}
