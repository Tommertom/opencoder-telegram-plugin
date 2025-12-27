# OpenCode Telegram Notification Plugin

Get notified on Telegram when your OpenCode sessions complete.

## Installation

1. Start a chat with [@opencode_notify_bot](https://t.me/opencodetelegramnotificationbot)
2. Send `/start`
3. Run the command the bot sends you
4. Done!

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Get installation command |
| `/revoke` | Generate new key (invalidates old one) |
| `/status` | Check installation status |
| `/help` | Show help message |

## How It Works

1. The bot generates a unique install key for you
2. The install script configures the plugin with your key
3. When OpenCode finishes a task, the plugin notifies the bot
4. The bot sends you a Telegram message

Your Telegram chat ID is never stored in the plugin — only a revocable key.

## Uninstall

```bash
rm ~/.config/opencode/plugin/telegram-notify.js
```

Optionally, send `/revoke` to the bot to invalidate your key.

## Security

- Your chat ID never leaves the server
- You can revoke your key anytime with `/revoke`
- The plugin only contains a UUID key, not your chat ID

## Development

### Prerequisites

- Node.js 22+
- pnpm 10+
- Cloudflare account
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### Setup

```bash
# Install dependencies
pnpm install

# Create KV namespace
wrangler kv namespace create "USERS"
wrangler kv namespace create "USERS" --preview

# Add KV IDs to worker/wrangler.jsonc

# Set bot token
wrangler secret put BOT_TOKEN

# Start local development
pnpm dev
```

### Manual Deployment (from localhost)

```bash
# 1. Login to Cloudflare (first time only)
cd worker && pnpm exec wrangler login

# 2. Create KV namespace (first time only)
pnpm exec wrangler kv namespace create "USERS"
# Copy the ID and update worker/wrangler.jsonc

# 3. Deploy the worker
pnpm exec wrangler deploy

# 4. Set the BOT_TOKEN secret (first time or when rotating token)
pnpm exec wrangler secret put BOT_TOKEN
# Paste your bot token when prompted

# 5. Set Telegram webhook (first time only)
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://opencode-telegram-bot.<your-subdomain>.workers.dev/webhook"
```

To redeploy after changes, just run:
```bash
cd worker && pnpm exec wrangler deploy
```

### Automated Deployment (GitHub Actions)

Push to `main` branch triggers automatic deployment via GitHub Actions.

### Required GitHub Secrets (for automated deployment)

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `BOT_TOKEN` | Telegram bot token from BotFather |

### Set Webhook

After deployment, set the Telegram webhook:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://opencode-telegram-bot.<subdomain>.workers.dev/webhook"
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values:

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `KV_NAMESPACE_ID` | Cloudflare KV namespace ID |
| `KV_PREVIEW_NAMESPACE_ID` | Cloudflare KV preview namespace ID |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `WORKER_URL` | Worker URL (available after first deployment) |

## License

MIT
