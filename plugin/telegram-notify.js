const INSTALL_KEY = "__INSTALL_KEY__";
const WORKER_URL = "__WORKER_URL__";

export async function TelegramNotify({ project, directory }) {
  // Validate configuration - check if placeholders were not replaced
  if (INSTALL_KEY.startsWith("__") || WORKER_URL.startsWith("__")) {
    console.error(
      "[TelegramNotify] Plugin not configured. Please replace INSTALL_KEY and WORKER_URL placeholders.",
    );
    return {
      event: async () => {},
    };
  }

  // Extract project name
  const projectName = project?.name || (directory ? directory.split("/").pop() : null) || "Unknown";

  async function sendNotification() {
    try {
      const response = await fetch(`${WORKER_URL}/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: INSTALL_KEY,
          project: projectName,
        }),
      });

      if (!response.ok) {
        console.error(
          `[TelegramNotify] Failed to send notification: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(`[TelegramNotify] Error sending notification: ${error.message}`);
    }
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await sendNotification();
      }
    },
  };
}
