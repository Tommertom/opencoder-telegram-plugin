#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
WORKER_URL="${WORKER_URL:-https://opencode-telegram-bot.davasny.workers.dev}"
PLUGIN_DIR="$HOME/.config/opencode/plugin"
PLUGIN_URL="https://raw.githubusercontent.com/Davasny/opencode-telegram-notification-plugin/main/plugin/dist/telegram-notify.js"

main() {
    local install_key="$1"

    # Validate input
    if [ -z "$install_key" ]; then
        echo -e "${RED}Error: Install key is required${NC}"
        echo "Usage: curl -fsSL <url> | bash -s -- <INSTALL_KEY>"
        echo ""
        echo "Get your install key by messaging /start to the Telegram bot."
        exit 1
    fi

    echo -e "${YELLOW}Installing OpenCode Telegram Notification Plugin...${NC}"

    # Create plugin directory
    mkdir -p "$PLUGIN_DIR"

    # Download and configure plugin
    echo "Downloading plugin..."
    curl -fsSL "$PLUGIN_URL" \
        | sed "s|__INSTALL_KEY__|$install_key|g; s|__WORKER_URL__|$WORKER_URL|g" \
        > "$PLUGIN_DIR/telegram-notify.js"

    # Verify installation
    if [ -f "$PLUGIN_DIR/telegram-notify.js" ]; then
        echo -e "${GREEN}Plugin installed successfully!${NC}"
        echo -e "   Location: $PLUGIN_DIR/telegram-notify.js"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "   1. Restart OpenCode if it's running"
        echo "   2. You'll receive Telegram notifications when sessions complete"
        echo ""
        echo -e "${YELLOW}To uninstall:${NC}"
        echo "   rm $PLUGIN_DIR/telegram-notify.js"

        # Send installation notification
        curl -sS -X POST "$WORKER_URL/notify" \
            -H "Content-Type: application/json" \
            -d "{\"key\": \"$install_key\", \"message\": \"✅ OpenCode Telegram Notification Plugin installed successfully!\"}" \
            > /dev/null 2>&1 || true
    else
        echo -e "${RED}Installation failed${NC}"
        exit 1
    fi
}

main "$@"
