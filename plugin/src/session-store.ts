/**
 * SessionStore manages session metadata, particularly human-friendly titles
 * keyed by session ID for improved UI/UX in session listings.
 */
export class SessionStore {
  private sessionTitles: Map<string, string> = new Map();

  /**
   * Store or update a session title
   * @param sessionId - The unique session identifier
   * @param title - The human-friendly session title
   */
  setTitle(sessionId: string, title: string): void {
    this.sessionTitles.set(sessionId, title);
  }

  /**
   * Retrieve a session title by ID
   * @param sessionId - The unique session identifier
   * @returns The stored title, or null if not found
   */
  getTitle(sessionId: string): string | null {
    return this.sessionTitles.get(sessionId) ?? null;
  }

  /**
   * Check if a session title exists
   * @param sessionId - The unique session identifier
   * @returns true if title exists, false otherwise
   */
  hasTitle(sessionId: string): boolean {
    return this.sessionTitles.has(sessionId);
  }

  /**
   * Remove a session title
   * @param sessionId - The unique session identifier
   * @returns true if removed, false if not found
   */
  removeTitle(sessionId: string): boolean {
    return this.sessionTitles.delete(sessionId);
  }

  /**
   * Clear all stored session titles
   */
  clearAll(): void {
    this.sessionTitles.clear();
  }

  /**
   * Get all session IDs that have stored titles
   * @returns Array of session IDs
   */
  getAllSessionIds(): string[] {
    return Array.from(this.sessionTitles.keys());
  }

  /**
   * Get the number of stored session titles
   * @returns Count of stored titles
   */
  getCount(): number {
    return this.sessionTitles.size;
  }
}
