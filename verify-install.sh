#!/bin/bash
set -e

echo "🔍 OpenCoder Telegram Remote Plugin - Installation Verification"
echo ""

# Check Node.js
echo -n "✓ Node.js version: "
node --version || { echo "❌ Node.js not found. Install Node.js 18+"; exit 1; }

# Check if built
if [ ! -f "plugin/dist/telegram-remote.js" ]; then
    echo "❌ Plugin not built. Run: npm run build"
    exit 1
fi
echo "✓ Plugin built: plugin/dist/telegram-remote.js"

# Check .env
if [ ! -f "plugin/.env" ]; then
    echo "⚠️  Warning: plugin/.env not found"
    echo "   Copy .env.example and configure it"
else
    echo "✓ Configuration file exists: plugin/.env"
    
    # Check required vars
    if ! grep -q "TELEGRAM_BOT_TOKEN=.\+" plugin/.env 2>/dev/null; then
        echo "   ⚠️  TELEGRAM_BOT_TOKEN appears empty"
    fi
    
    if ! grep -q "TELEGRAM_GROUP_ID=.\+" plugin/.env 2>/dev/null; then
        echo "   ⚠️  TELEGRAM_GROUP_ID appears empty"
    fi
    
    if ! grep -q "TELEGRAM_ALLOWED_USER_IDS=.\+" plugin/.env 2>/dev/null; then
        echo "   ⚠️  TELEGRAM_ALLOWED_USER_IDS appears empty"
    fi
fi

# Check OpenCode config
OPENCODE_CONFIG="$HOME/.config/opencode/opencode.json"
if [ ! -f "$OPENCODE_CONFIG" ]; then
    echo "⚠️  OpenCode config not found: $OPENCODE_CONFIG"
    echo "   You'll need to create it and add the plugin"
else
    echo "✓ OpenCode config exists: $OPENCODE_CONFIG"
    
    if grep -q "telegram-remote" "$OPENCODE_CONFIG" 2>/dev/null; then
        echo "✓ Plugin appears to be registered in OpenCode"
    else
        echo "⚠️  Plugin not found in OpenCode config"
        echo "   Add the plugin to $OPENCODE_CONFIG"
    fi
fi

echo ""
echo "📋 Next steps:"
echo "   1. Configure plugin/.env with your bot credentials"
echo "   2. Add plugin to $OPENCODE_CONFIG"
echo "   3. Start OpenCode"
echo "   4. Send /new in your Telegram group"
echo ""
echo "For help, see QUICKSTART.md or README.md"
