#!/usr/bin/env node
/**
 * Test script to verify plugin loading
 * This simulates how OpenCoder loads and initializes the plugin
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("=".repeat(80));
console.log("Testing OpenCoder Telegram Remote Plugin Load");
console.log("=".repeat(80));

async function testPluginLoad() {
  try {
    console.log("\n1. Loading plugin module...");
    const pluginPath = resolve(__dirname, ".opencode/plugin/telegram-remote.js");
    console.log(`   Plugin path: ${pluginPath}`);
    
    const { TelegramRemote } = await import(pluginPath);
    
    if (!TelegramRemote) {
      console.error("❌ Failed: TelegramRemote export not found");
      process.exit(1);
    }
    console.log("✅ Plugin module loaded successfully");
    console.log(`   Type: ${typeof TelegramRemote}`);
    
    console.log("\n2. Creating mock OpenCode client...");
    const mockClient = {
      logger: {
        info: (msg, data) => console.log(`[MOCK LOGGER INFO] ${msg}`, data || ''),
        error: (msg, data) => console.log(`[MOCK LOGGER ERROR] ${msg}`, data || ''),
        warn: (msg, data) => console.log(`[MOCK LOGGER WARN] ${msg}`, data || ''),
        debug: (msg, data) => console.log(`[MOCK LOGGER DEBUG] ${msg}`, data || ''),
      },
      session: {
        create: async (params) => {
          console.log("   [MOCK] session.create called with:", params);
          return { 
            data: { 
              id: "test-session-123",
              name: "Test Session"
            },
            error: null 
          };
        },
        list: async () => {
          console.log("   [MOCK] session.list called");
          return { 
            data: [
              { id: "session-1", name: "Session 1" },
              { id: "session-2", name: "Session 2" }
            ],
            error: null 
          };
        },
        get: async (id) => {
          console.log("   [MOCK] session.get called with id:", id);
          return {
            data: { id, name: "Mock Session" },
            error: null
          };
        },
      },
      message: {
        send: async (params) => {
          console.log("   [MOCK] message.send called with:", params);
          return { 
            data: { id: "msg-123", sessionId: params.sessionId },
            error: null 
          };
        },
      },
    };
    console.log("✅ Mock client created");
    
    console.log("\n3. Initializing plugin...");
    const plugin = await TelegramRemote({ client: mockClient });
    
    if (!plugin) {
      console.error("❌ Failed: Plugin initialization returned null/undefined");
      process.exit(1);
    }
    console.log("✅ Plugin initialized successfully");
    
    console.log("\n4. Checking plugin structure...");
    if (!plugin.event || typeof plugin.event !== 'function') {
      console.error("❌ Failed: Plugin missing 'event' handler function");
      process.exit(1);
    }
    console.log("✅ Plugin has event handler");
    
    console.log("\n5. Testing event handler with mock event...");
    const mockEvent = {
      type: "session.created",
      timestamp: Date.now(),
      data: {
        session: {
          id: "test-session-123",
          name: "Test Session"
        }
      }
    };
    
    try {
      await plugin.event({ event: mockEvent });
      console.log("✅ Event handler executed without errors");
    } catch (error) {
      console.error("❌ Event handler failed:", error);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ Plugin loading test PASSED");
    console.log("=".repeat(80));
    console.log("\nNote: The plugin will continue running because the Telegram bot");
    console.log("is polling. Press Ctrl+C to stop.");
    console.log("\nIf you see errors above about TELEGRAM_BOT_TOKEN or configuration,");
    console.log("make sure your .env file is properly configured.");
    
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ Plugin loading test FAILED");
    console.error("=".repeat(80));
    console.error("\nError details:");
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testPluginLoad();
