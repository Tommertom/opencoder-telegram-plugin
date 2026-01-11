# OpenCoder Telegram Remote Plugin

Control OpenCode sessions remotely via Telegram using Topics for session isolation.

> **Disclaimer:** This project is not affiliated with, endorsed by, or sponsored by OpenCode, SST, or any of their affiliates. OpenCode is a trademark of SST.

## Features

- 🔐 **Secure**: Whitelist-based user access control
- 📁 **Topic-based sessions**: Each OpenCode session maps to a Telegram Topic
- 🤖 **Remote control**: Send prompts and receive responses via Telegram
- 🔄 **Auto-session creation**: Topics automatically create sessions on first message
- 💬 **Real-time feedback**: Assistant responses streamed back to the topic

## Requirements

- Node.js 18+
- OpenCode CLI installed
- Telegram Bot (from [@BotFather](https://t.me/BotFather))
- Private Telegram Supergroup with Topics enabled
- Bot must be admin in the group

## Installation

### 1. Create Telegram Bot

1. Talk to [@BotFather](https://t.me/BotFather)
2. Create a new bot with `/newbot`
3. Save the bot token

### 2. Setup Telegram Group

1. Create a new **Supergroup** in Telegram
2. Make it **private**
3. Add your bot as admin with all permissions
4. Enable **Topics** (Group Settings → Topics → Enable)
5. Get the group ID:
   - Add [@userinfobot](https://t.me/userinfobot) to the group
   - It will show the group ID (numeric, usually negative)
   - Remove the bot after getting the ID

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
TELEGRAM_GROUP_ID=-1001234567890
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

Send `/new` command anywhere in the group. The bot will:
- Create a new OpenCode session
- Create a new Topic named `Session <short-id>`
- Post confirmation in the topic

### Sending Prompts

1. Open any topic (or send message in a new topic)
2. Type your prompt and send
3. The bot forwards it to the OpenCode session
4. Assistant responses appear in the same topic

### Auto-Session Creation

Send any message in a topic without `/new`:
- Bot automatically creates a session bound to that topic
- All messages in that topic go to the same session

## Architecture

```
Telegram Topic 1  ←→  OpenCode Session 1
Telegram Topic 2  ←→  OpenCode Session 2
Telegram Topic 3  ←→  OpenCode Session 3
```

- **One topic = One session** (1:1 mapping)
- Sessions persist in memory only
- Topics are never auto-deleted

## Security

### Access Control

- Only whitelisted user IDs can interact with the bot
- User whitelist is comma-separated in `.env`
- Non-whitelisted users are silently ignored

### Best Practices

1. Use a **private** Telegram Supergroup
2. Keep the bot token secret
3. Only add trusted users to whitelist
4. Review `.env` file permissions (should be readable only by you)

### What's NOT Supported

- ❌ Public groups (use private groups only)
- ❌ Webhooks (uses long polling)
- ❌ Persistent sessions (memory only)
- ❌ Multi-user session sharing (one session per topic)
- ❌ Inline keyboards or buttons
- ❌ Streaming (incremental text updates)

## Configuration Reference

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather | `123456:ABC-DEF...` |
| `TELEGRAM_GROUP_ID` | ✅ | Numeric group ID (usually negative) | `-1001234567890` |
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
- Check bot is admin in the group
- Confirm your user ID is in whitelist
- Check OpenCode logs for errors

### Can't create topics

- Ensure group is a **Supergroup** (not regular group)
- Enable Topics in group settings
- Verify bot has admin rights to manage topics

### Session not found

- Sessions are memory-only
- Restarting OpenCode clears all sessions
- Each topic needs its own session

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
│   ├── session-store.ts      # Topic ↔ Session mapping
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

Extended with remote control functionality using Grammy and Telegram Topics.
# opencoder-telegram-plugin
