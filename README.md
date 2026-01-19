# OpenCoder Telegram Remote Plugin

Control OpenCode sessions remotely via Telegram in a single chat.

> **Disclaimer:** This project is not affiliated with, endorsed by, or sponsored by OpenCode, SST, or any of their affiliates. OpenCode is a trademark of SST.

## Features

- 🔐 **Secure**: Whitelist-based user access control
- 💬 **Single chat interface**: All interactions in one Telegram chat
- 🤖 **Remote control**: Send prompts and receive responses via Telegram
- 🔄 **Auto-session management**: Automatically creates and manages sessions
- ⚡ **Real-time feedback**: Assistant responses streamed back to chat

## Requirements

- Node.js 18+
- OpenCode CLI installed
- Telegram Bot (from [@BotFather](https://t.me/BotFather))
- Direct private chat with your bot

## Installation

### 1. Create Telegram Bot

1. Talk to [@BotFather](https://t.me/BotFather)
2. Create a new bot with `/newbot`
3. Save the bot token

### 2. Start a Private Chat with the Bot

1. Open your bot in Telegram
2. Tap **Start**
3. Send any message to establish the chat

### 3. Get Your User ID

1. Send any message to [@userinfobot](https://t.me/userinfobot)
2. Save your numeric user ID

### 4. Configure Plugin

Clone and build:

```bash
git clone https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin.git
cd opencoder-telegram-remote-plugin/plugin
npm install
npm run build
```

Create `.env` file in the plugin directory:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

### 5. Install in OpenCode

Add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugins": [
    {
      "name": "telegram-remote",
      "path": "/path/to/opencoder-telegram-remote-plugin/plugin/dist/telegram-remote.js"
    }
  ]
}
```

Or copy the built file:

```bash
cp dist/telegram-remote.js ~/.config/opencode/plugin/
```

Then reference it:

```json
{
  "plugins": [
    {
      "name": "telegram-remote",
      "path": "~/.config/opencode/plugin/telegram-remote.js"
    }
  ]
}
```

## Usage

### Creating a Session

Send `/new` command in the chat. The bot will:
- Create a new OpenCode session
- Set it as the active session
- Post confirmation in the chat

### Sending Prompts

1. Type your prompt and send it in the chat
2. The bot forwards it to the active OpenCode session
3. Assistant responses appear in the same chat

### Auto-Session Creation

Send any message without using `/new` first:
- Bot automatically creates a session
- Sets it as the active session
- All subsequent messages go to this session

### Switching Sessions

To switch to a different session:
- Use `/new` to create and switch to a new session
- The new session becomes the active session

## Architecture

```
Telegram Chat  ←→  Active OpenCode Session
```

- **One active session** at a time
- Use `/new` to create and switch sessions
- Previous session remains in OpenCode but becomes inactive
- Sessions persist in memory only

## Global State Management

The plugin uses a `GlobalStateStore` to manage various states across the application. This store maintains the following states:

- **Events**: A list of stored events, each containing:
  - `type`: The event type (e.g., session updates, message updates)
  - `data`: Associated event data
  - `timestamp`: When the event occurred
  - Only allowed event types are stored, as defined during initialization

- **Available Agents**: A list of agents available in the OpenCode environment

- **Current Agent**: The currently selected agent for interactions

- **Current Session Title**: The title of the active OpenCode session

- **Session Status**: The current status of the session (e.g., active, inactive)

- **Last Message Part Update**: The most recent update to a message part, used for tracking incremental message changes

These states are used to coordinate between the Telegram bot interface and the OpenCode session management, ensuring real-time synchronization and proper handling of user interactions.

## Commands

- `/new` - Create a new session and set it as active
- `/deletesessions` - Delete all OpenCode sessions
- `/help` - Show help message

## Security

### Access Control

- Only whitelisted user IDs can interact with the bot
- User whitelist is comma-separated in `.env`
- Non-whitelisted users are silently ignored

### Best Practices

1. Use a **private** chat with the bot
2. Keep the bot token secret
3. Only add trusted users to whitelist
4. Review `.env` file permissions (should be readable only by you)

### What's NOT Supported

- ❌ Public chats
- ❌ Webhooks (uses long polling)
- ❌ Persistent sessions (memory only)
- ❌ Multiple concurrent sessions (one active session at a time)
- ❌ Inline keyboards or buttons

## Configuration Reference

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather | `123456:ABC-DEF...` |
| `TELEGRAM_ALLOWED_USER_IDS` | ✅ | Comma-separated user IDs | `123456789,987654321` |

### OpenCode Plugin Configuration

```json
{
  "plugins": [
    {
      "name": "telegram-remote",
      "path": "/absolute/path/to/telegram-remote.js"
    }
  ]
}
```

## Troubleshooting

### Bot doesn't respond

- Verify bot token is correct
- Confirm your user ID is in whitelist
- Ensure you've started a private chat with the bot
- Check OpenCode logs for errors

### Session not found

- Sessions are memory-only
- Restarting OpenCode clears all sessions
- Use `/new` to create a session if none exists

### Permission denied

- Your user ID must be in `TELEGRAM_ALLOWED_USER_IDS`
- Check you copied the correct numeric ID (not username)

## Development

### Project Structure

```
plugin/
├── src/
│   ├── telegram-remote.ts    # Main plugin entry
│   ├── bot.ts                # Grammy bot setup
│   ├── config.ts             # Environment config loader
│   ├── session-store.ts      # Active session tracking
│   ├── message-tracker.ts    # Track message roles
│   └── lib/
│       ├── logger.ts         # OpenCode logging
│       ├── types.ts          # TypeScript types
│       └── config.ts         # Service constants
├── dist/                     # Built output
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### Build

```bash
cd plugin
npm run build      # Production build
npm run dev        # Watch mode
npm run typecheck  # Type checking only
```

### Testing Locally

1. Build the plugin
2. Configure `.env` with test bot credentials
3. Point OpenCode to the built file
4. Start OpenCode and verify bot connects

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` and `npm run build`
5. Submit a pull request

## License

MIT

## Credits

Forked from [opencode-telegram-notification-plugin](https://github.com/Davasny/opencode-telegram-notification-plugin)

Extended with remote control functionality using Grammy.
# opencoder-telegram-plugin
