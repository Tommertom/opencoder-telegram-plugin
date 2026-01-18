import { Keyboard } from "grammy";

/**
 * Creates a persistent reply keyboard with Tab and Esc buttons
 */
export function createDefaultKeyboard(): Keyboard {
  const keyboard = new Keyboard().text("/tab").text("/esc").resized().persistent();

  return keyboard;
}
