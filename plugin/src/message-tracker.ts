export class MessageTracker {
  private userMessages = new Set<string>();
  private assistantMessages = new Set<string>();
  private messageContent = new Map<string, string>();
  private statusMessageIds = new Map<string, number>(); // messageId -> telegram message ID
  private processingPrompts = new Map<string, boolean>(); // messageId -> processing flag
  private latestUpdates = new Map<string, string>(); // messageId -> latest update text
  private updateIntervals = new Map<string, NodeJS.Timeout>(); // messageId -> interval handle

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

  setStatusMessageId(messageId: string, telegramMessageId: number): void {
    this.statusMessageIds.set(messageId, telegramMessageId);
  }

  getStatusMessageId(messageId: string): number | undefined {
    return this.statusMessageIds.get(messageId);
  }

  setProcessingPrompt(messageId: string, processing: boolean): void {
    this.processingPrompts.set(messageId, processing);
  }

  isProcessingPrompt(messageId: string): boolean {
    return this.processingPrompts.get(messageId) || false;
  }

  setLatestUpdate(messageId: string, text: string): void {
    this.latestUpdates.set(messageId, text);
  }

  getLatestUpdate(messageId: string): string | undefined {
    return this.latestUpdates.get(messageId);
  }

  setUpdateInterval(messageId: string, interval: NodeJS.Timeout): void {
    this.updateIntervals.set(messageId, interval);
  }

  clearUpdateInterval(messageId: string): void {
    const interval = this.updateIntervals.get(messageId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(messageId);
    }
  }

  clearAllTracking(messageId: string): void {
    this.clearUpdateInterval(messageId);
    this.statusMessageIds.delete(messageId);
    this.processingPrompts.delete(messageId);
    this.latestUpdates.delete(messageId);
    this.clearContent(messageId);
  }
}
