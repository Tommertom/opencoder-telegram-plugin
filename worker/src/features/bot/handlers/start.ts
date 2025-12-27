import { sendTelegramMessage } from "../../../lib/telegram";
import type { Env } from "../../../lib/types";
import { createUser, findUserKeyByChatId, generateInstallKey } from "../../users/service";
import { buildInstallCommand } from "./utils";

export async function handleStart(chatId: number, firstName: string, env: Env): Promise<void> {
  const existing = await findUserKeyByChatId(env.USERS, chatId);

  if (existing) {
    const installCommand = buildInstallCommand(existing.key);
    await sendTelegramMessage(
      env.BOT_TOKEN,
      chatId,
      `
Hey ${firstName}! You already have an install key.

*Run this command to install the plugin:*
\`\`\`bash
${installCommand}
\`\`\`

Use /revoke to generate a new key if needed.
`.trim(),
    );

    return;
  }

  const installKey = generateInstallKey();
  await createUser(env.USERS, installKey, { chatId, firstName });

  const installCommand = buildInstallCommand(installKey);
  const welcomeMessage = `
Hey ${firstName}!

I'll notify you when your OpenCode sessions complete.

*Run this command to install:*
\`\`\`bash
${installCommand}
\`\`\`

After installation, you'll receive a notification whenever OpenCode finishes a task.

Commands:
/revoke - Generate a new install key (invalidates old one)
/status - Check your installation status
/help - Show help message
  `.trim();

  await sendTelegramMessage(env.BOT_TOKEN, chatId, welcomeMessage);
}
