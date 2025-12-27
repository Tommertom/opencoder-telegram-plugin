export function extractProjectName(directory: string | undefined): string {
  if (directory) {
    return directory.split("/").pop() || "Unknown";
  }
  return "Unknown";
}

export function calculateDurationSeconds(
  createdAt: number | undefined,
  updatedAt: number | undefined,
): number | null {
  if (!createdAt || !updatedAt) {
    return null;
  }

  // timestamps are in milliseconds
  return Math.round((updatedAt - createdAt) / 1000);
}
