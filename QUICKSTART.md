# Quick Start Guide

Get up and running with OpenCoder Telegram Remote Plugin in 5 minutes.

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] OpenCode CLI installed
- [ ] Telegram account

## Step-by-Step Setup

### 1. Create Bot (2 minutes)

1. Open Telegram, search for `@BotFather`
2. Send: `/newbot`
3. Follow prompts to name your bot
4. **Save the token** (looks like `123456789:ABCdefGHI...`)

### 2. Setup Group (3 minutes)

1. Create a new group in Telegram
2. Go to Group Info → Convert to Supergroup
3. Group Info → Group Type → Private
4. Group Info → Administrators → Add your bot as admin (give all permissions)
5. Group Info → Topics → Enable Topics
6. Add `@userinfobot` to the group temporarily
7. **Copy the Group ID** (negative number like `-1001234567890`)
8. Remove `@userinfobot`

### 3. Get Your User ID (30 seconds)

1. Send any message to `@userinfobot` in private
2. **Copy your numeric ID** (like `123456789`)

### 4. Install Plugin (2 minutes)

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/opencoder-telegram-remote-plugin.git
cd opencoder-telegram-remote-plugin/plugin

# Install and build
npm install
npm run build

# Configure
cat > .env << EOL
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_GROUP_ID=YOUR_GROUP_ID_HERE
TELEGRAM_ALLOWED_USER_IDS=YOUR_USER_ID_HERE
EOL
```

### 5. Link to OpenCode (1 minute)

Edit `~/.config/opencode/opencode.json`:

```json
{
  "plugins": [
    {
      "name": "telegram-remote",
      "path": "/full/path/to/opencoder-telegram-remote-plugin/plugin/dist/telegram-remote.js"
    }
  ]
}
```

**Replace `/full/path/to/` with the actual path!**

### 6. Test It

1. Start OpenCode CLI
2. In your Telegram group, send `/new`
3. Bot creates a new topic
4. Send a message in that topic
5. Receive AI response! 🎉

## Common Issues

**Bot doesn't respond?**
- Check bot token in `.env`
- Verify bot is admin in group
- Confirm your user ID is correct

**"Permission denied"?**
- Your user ID must be in `TELEGRAM_ALLOWED_USER_IDS`
- Use numeric ID, not @username

**Can't create topics?**
- Group must be a Supergroup
- Topics must be enabled in settings
- Bot needs admin rights

## What's Next?

- Read the full [README.md](README.md) for advanced features
- Add multiple user IDs (comma-separated)
- Use multiple topics for different tasks

## Commands

- `/new` - Create new session with dedicated topic

That's it! You're ready to control OpenCode from Telegram.
