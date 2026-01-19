import type { TelegramBotManager } from "../bot.js";
import type { GlobalStateStore } from "../global-state-store.js";
import type { Logger } from "../lib/logger.js";

interface SessionState {
    intervalId: NodeJS.Timeout;
    messageId?: number;
    lastSentText?: string;
    finalSent: boolean;
}

export class StepUpdateService {
    private sessions: Map<string, SessionState> = new Map();

    constructor(
        private bot: TelegramBotManager,
        private globalStateStore: GlobalStateStore,
        private logger: Logger,
        private intervalMs: number,
    ) { }

    start(sessionId: string): void {
        if (!sessionId || this.sessions.has(sessionId)) {
            return;
        }

        const intervalId = setInterval(() => {
            void this.sendUpdate(sessionId, false);
        }, this.intervalMs);

        this.sessions.set(sessionId, {
            intervalId,
            finalSent: false,
        });

        void this.sendUpdate(sessionId, false);
    }

    async finish(sessionId: string): Promise<void> {
        if (!sessionId) {
            return;
        }

        const state = this.sessions.get(sessionId);
        if (state) {
            clearInterval(state.intervalId);
        }

        const messageId = await this.sendUpdate(sessionId, true);

        if (state) {
            this.sessions.delete(sessionId);
        }

        if (messageId) {
            setTimeout(() => {
                void this.bot.deleteMessage(messageId).catch((error: unknown) => {
                    this.logger.warn("Failed to delete step update message", {
                        error: String(error),
                        sessionId,
                        messageId,
                    });
                });
            }, 2000);
        }
    }

    private async sendUpdate(sessionId: string, isFinal: boolean): Promise<number | undefined> {
        const text = this.globalStateStore.getLastUpdate(sessionId);
        if (!text || text.trim() === "") {
            if (isFinal) {
                const state = this.sessions.get(sessionId);
                if (state) {
                    state.finalSent = true;
                }
            }
            return undefined;
        }

        const state = this.sessions.get(sessionId);

        if (!state) {
            if (isFinal) {
                try {
                    const result = await this.bot.sendMessage(text);
                    return result.message_id;
                } catch (error) {
                    this.logger.warn("Failed to send final step update", {
                        error: String(error),
                        sessionId,
                    });
                }
            }
            return undefined;
        }

        if (state.finalSent && !isFinal) {
            return state.messageId;
        }

        if (state.lastSentText === text && !isFinal) {
            return state.messageId;
        }

        if (isFinal && state.lastSentText === text && state.messageId) {
            state.finalSent = true;
            return state.messageId;
        }

        try {
            if (state.messageId) {
                await this.bot.editMessage(state.messageId, text);
            } else {
                const result = await this.bot.sendMessage(text);
                state.messageId = result.message_id;
            }

            state.lastSentText = text;
            if (isFinal) {
                state.finalSent = true;
            }
            return state.messageId;
        } catch (error) {
            this.logger.warn("Failed to send step update", {
                error: String(error),
                sessionId,
                isFinal,
            });
        }

        return state.messageId;
    }
}
