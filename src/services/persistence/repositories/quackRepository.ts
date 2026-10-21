import type { QuackAttachment } from "@/lib/quack";
import { encrypt, decrypt } from "../crypto";
import { getSetting, setSetting } from "./settingsRepository";

const CATEGORY = "quack";
const KEY = "attachments";

export interface StoredQuackAttachment extends QuackAttachment {
  /** Null when the stored token could not be decrypted. */
  token: string | null;
}

interface StoredRecord extends QuackAttachment {
  /** AES-GCM ciphertext under the profile key, like connection credentials. */
  encryptedToken: string;
}

export async function getQuackAttachments(
  profileId: string,
  cryptoKey: CryptoKey
): Promise<StoredQuackAttachment[]> {
  const raw = await getSetting(profileId, CATEGORY, KEY);
  if (!raw) return [];
  let records: StoredRecord[];
  try {
    records = JSON.parse(raw) as StoredRecord[];
  } catch {
    return [];
  }
  return Promise.all(
    records.map(async ({ alias, host, encryptedToken }) => {
      let token: string | null = null;
      try {
        token = await decrypt(encryptedToken, cryptoKey);
      } catch {
        console.warn(`Failed to decrypt the token of Quack attachment ${alias}`);
      }
      return { alias, host, token };
    })
  );
}

export async function saveQuackAttachments(
  profileId: string,
  attachments: Array<QuackAttachment & { token: string }>,
  cryptoKey: CryptoKey
): Promise<void> {
  const records: StoredRecord[] = await Promise.all(
    attachments.map(async ({ alias, host, token }) => ({
      alias,
      host,
      encryptedToken: await encrypt(token, cryptoKey),
    }))
  );
  await setSetting(profileId, CATEGORY, KEY, JSON.stringify(records));
}
