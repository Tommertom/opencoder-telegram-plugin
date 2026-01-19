# AGENTS.md - Agentic Coding Guide

This document provides guidelines for AI coding agents working in this codebase.

## Project Overview

OpenCoder Telegram Remote Plugin - A plugin that enables remote control of OpenCode
sessions via Telegram in a single chat. Built with TypeScript,
Grammy (Telegram Bot framework), and the OpenCode Plugin SDK.

## Tech Stack

- **Language**: TypeScript 5.8+
- **Runtime**: Node.js 18+
- **Module System**: ESM (`"type": "module"`)
- **Package Manager**: npm (pnpm also configured)
- **Build Tool**: tsup
- **Linter/Formatter**: Biome
- **Bot Framework**: Grammy (Telegram Bot API)

## Build/Lint/Test Commands

### From Root Directory

```bash
npm run build      # Build the plugin
npm run dev        # Development mode (watch)
npm run typecheck  # Type checking
npm run lint       # Lint (check only)
npm run lint:fix   # Lint and auto-fix
npm run format     # Format code
```

### Testing

**No test framework is currently configured.** Manual verification:
- `npm run build` - Confirms successful compilation
- `npm run typecheck` - Confirms no TypeScript errors
- `npm run testing-group-sending` - Tests Telegram bot integration by creating/sending messages to a test topic (script in scripts/testing-group-sending.ts)
- `npm run testing-message-listener` - Tests bot message listening by responding to messages in the general topic (script in scripts/testing-message-listener.ts)

## Code Style Guidelines

### Biome Configuration

- **Indentation**: 2 spaces
- **Line width**: 100 characters
- **Quote style**: Double quotes
- **Trailing commas**: All (required)
- **Semicolons**: Required

### Linting Rules

- `noUnusedVariables`: error
- `noUnusedImports`: error
- `useConst`: error (prefer const over let)

## Import Conventions

Always use explicit `import type` for type-only imports:

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config.js";  // Include .js extension (ESM)
```

**Import Order**: External types → External values → Local types → Local values

## Naming Conventions

- **Files**: kebab-case (`session-store.ts`, `question-tracker.ts`)
- **Variables/Functions**: camelCase (`loadConfig`, `createLogger`)
- **Classes/Interfaces**: PascalCase (`SessionStore`, `QuestionTracker`)
- **Constants**: UPPER_SNAKE_CASE (`SERVICE_NAME`)
- **No "I" prefix**: Use `Config` not `IConfig`

## Code Patterns

- **Classes**: Use for stateful components (e.g., `SessionStore`, `QuestionTracker`)
- **Factory Functions**: Use for creating instances with dependencies (e.g., `createLogger`)

- **Async/Await**: Always use instead of raw promises
- **Utility Functions**: Always check existing utility functions in `lib/` before creating new ones

```typescript
// Example: Error handling pattern
try {
  const response = await client.session.create({ body: {} });
  if (response.error) {
    logger.error("Failed to create session", { error: response.error });
    await ctx.reply("Failed to create session");
    return;
  }
} catch (error) {
  logger.error("Failed to create session", { error: String(error) });
}
```

## Project Structure

```
plugin/
├── src/
│   ├── telegram-remote.ts    # Main plugin entry point
│   ├── bot.ts                # Grammy bot setup and handlers
│   ├── config.ts             # Environment config loader
│   ├── session-store.ts      # Active session tracking
│   ├── global-state-store.ts # Global state tracking
│   └── lib/
│       ├── config.ts         # Service constants

│       ├── logger.ts         # OpenCode logging wrapper
│       ├── types.ts          # TypeScript type definitions
│       └── utils.ts          # Utility functions (e.g., sendTemporaryMessage)
├── dist/                     # Built output
├── package.json
├── tsconfig.json
└── tsup.config.ts
scripts/
├── testing-group-sending.ts  # Telegram bot integration test
└── testing-message-listener.ts # Telegram bot message listener test
```

## Environment Variables

Required in `.env`:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated user IDs |

**Never commit `.env` files or secrets.**

## Common Workflows

### Adding a New Bot Command

1. Open `plugin/src/bot.ts`
2. Add handler: `bot.command("name", async (ctx) => { ... })`
3. Follow existing patterns for error handling and logging
4. Run `npm run build && npm run typecheck`

### Adding a New Event Handler

1. Open `plugin/src/telegram-remote.ts`
2. Add case in the `event` handler function
3. Use existing patterns for session/topic lookup

### Modifying Configuration

1. Update interface in `plugin/src/config.ts`
2. Add parsing logic in `loadConfig()`
3. Update `.env.example` if adding new variables

## Key Architecture Changes

As of the latest update, the plugin has been simplified:
- **No more topics**: Removed supergroup/topics functionality
- **Single chat**: All interactions happen in one Telegram chat
- **Active session**: One active session at a time (tracked in SessionStore)
- **Simplified bot interface**: Removed `getForumTopics`, `createForumTopic`, `deleteForumTopic` methods
- **Cleaner message flow**: Messages go to/from the active session directly
