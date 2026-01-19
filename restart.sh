#!/bin/bash

echo "Stopping existing opencode web processes..."
# Kill processes matching "opencode web", ignore error if none found
pkill -f "opencode web" || echo "No running 'opencode web' processes found."

# Wait a moment to ensure processes have terminated
sleep 2

echo "Navigating to /home/tom/opencoder-telegram-plugin..."
cd /home/tom/opencoder-telegram-plugin || { echo "Directory not found"; exit 1; }

echo "Running npm run build..."
npm run build

if [ $? -eq 0 ]; then
    echo "Build successful. Starting opencode web..."
    opencode web
else
    echo "Build failed. Aborting start."
    exit 1
fi
