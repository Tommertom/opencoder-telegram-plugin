import type { UserData } from "./schemas";

export async function findUserKeyByChatId(
  kv: KVNamespace,
  chatId: number,
): Promise<{ key: string; data: UserData } | null> {
  const existingKeys = await kv.list({ prefix: "" });
  for (const key of existingKeys.keys) {
    const data = await kv.get<UserData>(key.name, "json");
    if (data?.chatId === chatId) {
      return { key: key.name, data };
    }
  }
  return null;
}

export async function createUser(
  kv: KVNamespace,
  installKey: string,
  userData: Omit<UserData, "createdAt">,
): Promise<void> {
  const dataWithTimestamp: UserData = {
    ...userData,
    createdAt: Date.now(),
  };
  await kv.put(installKey, JSON.stringify(dataWithTimestamp));
}

export async function deleteUser(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

export async function getUserByKey(kv: KVNamespace, key: string): Promise<UserData | null> {
  return kv.get<UserData>(key, "json");
}

export function generateInstallKey(): string {
  return crypto.randomUUID();
}
