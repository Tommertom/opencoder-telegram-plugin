export class MessageTracker {
  private userMessages = new Set<string>();
  private assistantMessages = new Set<string>();

  markAsUser(messageId: string): void {
    this.userMessages.add(messageId);
    this.assistantMessages.delete(messageId);
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
}
