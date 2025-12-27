export function extractProjectName(directory: string | undefined): string {
  if (directory) {
    return directory.split("/").pop() || "Unknown";
  }
  return "Unknown";
}
