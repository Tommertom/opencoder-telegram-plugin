/**
 * TelegramQueue - A rate-limited queue for Telegram API calls
 * Processes queued API calls every 500ms to avoid 429 (Too Many Requests) errors
 */
export class TelegramQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor(intervalMs = 500) {
    this.intervalMs = intervalMs;
  }

  /**
   * Add a Telegram API call to the queue
   * @param fn - Async function that makes the Telegram API call
   * @returns Promise that resolves when the call completes
   */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      // Start processing if not already running
      if (!this.processing) {
        this.start();
      }
    });
  }

  /**
   * Start processing the queue
   */
  private start(): void {
    if (this.processing) {
      return;
    }

    this.processing = true;
    this.intervalId = setInterval(() => {
      this.processNext();
    }, this.intervalMs);

    // Process first item immediately
    this.processNext();
  }

  /**
   * Process the next item in the queue
   */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.stop();
      return;
    }

    const fn = this.queue.shift();
    if (fn) {
      try {
        await fn();
      } catch (error) {
        console.error("[TelegramQueue] Error processing queue item:", error);
      }
    }
  }

  /**
   * Stop processing the queue
   */
  private stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.processing = false;
  }

  /**
   * Get the current queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if the queue is currently processing
   */
  get isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Clear all pending items in the queue
   */
  clear(): void {
    this.queue = [];
    this.stop();
  }
}
