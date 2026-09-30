import { generateUUID } from "@/lib/utils";
import { isUsingOpfs, getSystemConnection, sqlQuote } from "../systemDb";
import { encrypt, decrypt } from "../crypto";
import { fallbackPut, fallbackGet, fallbackGetAll, fallbackDelete } from "../fallback";

export interface SavedConnection {
  id: string;
  profile_id: string;
  name: string;
  scope: string;
  config: string; // JSON
  encrypted_credentials: string | null;
  environment: string;
  created_at: string;
}

export interface ConnectionInput {
  /**
   * Id of the in-memory connection this record belongs to. Pass it whenever
   * the connection already exists in the store, so `deleteConnection(id)`
   * finds the stored row. A fresh id is generated only when it is absent.
   */
  id?: string;
  name: string;
  scope: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  environment?: string;
}

export async function saveConnection(
  profileId: string,
  input: ConnectionInput,
  cryptoKey: CryptoKey | null
): Promise<SavedConnection> {
  const id = input.id ?? generateUUID();
  const now = new Date().toISOString();
  const configJson = JSON.stringify(input.config);
  let encryptedCreds: string | null = null;

  if (input.credentials && cryptoKey) {
    encryptedCreds = await encrypt(JSON.stringify(input.credentials), cryptoKey);
  }

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`
      INSERT INTO connections (id, profile_id, name, scope, config, encrypted_credentials, environment, created_at)
      VALUES (${sqlQuote(id)}, ${sqlQuote(profileId)}, ${sqlQuote(input.name)}, ${sqlQuote(input.scope)}, ${sqlQuote(configJson)}, ${encryptedCreds ? sqlQuote(encryptedCreds) : "NULL"}, ${sqlQuote(input.environment ?? "APP")}, ${sqlQuote(now)})
    `);
  } else {
    await fallbackPut("connections", {
      id,
      profile_id: profileId,
      name: input.name,
      scope: input.scope,
      config: configJson,
      encrypted_credentials: encryptedCreds,
      environment: input.environment ?? "APP",
      created_at: now,
    });
  }

  return {
    id,
    profile_id: profileId,
    name: input.name,
    scope: input.scope,
    config: configJson,
    encrypted_credentials: encryptedCreds,
    environment: input.environment ?? "APP",
    created_at: now,
  };
}

export interface ConnectionUpdate {
  name: string;
  scope: string;
  config: Record<string, unknown>;
  /**
   * Omitted keeps the stored credentials untouched, `null` removes them, a
   * record replaces them (encrypted like `saveConnection` does).
   */
  credentials?: Record<string, unknown> | null;
  /** Omitted keeps the stored value. */
  environment?: string;
}

const readStoredConnection = async (id: string): Promise<SavedConnection | null> => {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(`SELECT * FROM connections WHERE id = ${sqlQuote(id)}`);
    const row = result.toArray()[0]?.toJSON();
    if (!row) return null;
    return {
      id: String(row.id),
      profile_id: String(row.profile_id),
      name: String(row.name),
      scope: String(row.scope),
      config: String(row.config),
      encrypted_credentials: row.encrypted_credentials ? String(row.encrypted_credentials) : null,
      environment: String(row.environment),
      created_at: String(row.created_at),
    };
  }
  return ((await fallbackGet("connections", id)) as SavedConnection | null) ?? null;
};

/**
 * Rewrites a stored connection in place, keeping its id and creation date.
 *
 * A connection that was never stored is saved as new, so an edit is never
 * lost just because the first save failed.
 */
export async function updateConnection(
  profileId: string,
  id: string,
  input: ConnectionUpdate,
  cryptoKey: CryptoKey | null
): Promise<SavedConnection> {
  const existing = await readStoredConnection(id);
  if (!existing) {
    return saveConnection(
      profileId,
      { ...input, id, credentials: input.credentials ?? undefined },
      cryptoKey
    );
  }

  let encryptedCreds = existing.encrypted_credentials;
  if (input.credentials !== undefined) {
    encryptedCreds =
      input.credentials && cryptoKey
        ? await encrypt(JSON.stringify(input.credentials), cryptoKey)
        : null;
  }

  const updated: SavedConnection = {
    ...existing,
    name: input.name,
    scope: input.scope,
    config: JSON.stringify(input.config),
    encrypted_credentials: encryptedCreds,
    environment: input.environment ?? existing.environment,
  };

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`
      UPDATE connections
      SET name = ${sqlQuote(updated.name)},
          scope = ${sqlQuote(updated.scope)},
          config = ${sqlQuote(updated.config)},
          encrypted_credentials = ${encryptedCreds ? sqlQuote(encryptedCreds) : "NULL"},
          environment = ${sqlQuote(updated.environment)}
      WHERE id = ${sqlQuote(id)}
    `);
  } else {
    await fallbackPut("connections", { ...updated });
  }

  return updated;
}

export async function getConnections(
  profileId: string,
  cryptoKey: CryptoKey | null
): Promise<
  Array<{
    id: string;
    name: string;
    scope: string;
    config: Record<string, unknown>;
    credentials: Record<string, unknown> | null;
    environment: string;
    created_at: string;
  }>
> {
  let records: SavedConnection[] = [];

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT * FROM connections WHERE profile_id = ${sqlQuote(profileId)} ORDER BY created_at`
    );
    records = result.toArray().map((row) => {
      const r = row.toJSON();
      return {
        id: String(r.id),
        profile_id: String(r.profile_id),
        name: String(r.name),
        scope: String(r.scope),
        config: String(r.config),
        encrypted_credentials: r.encrypted_credentials ? String(r.encrypted_credentials) : null,
        environment: String(r.environment),
        created_at: String(r.created_at),
      };
    });
  } else {
    const all = (await fallbackGetAll("connections")) as SavedConnection[];
    records = all.filter((r) => r.profile_id === profileId);
  }

  return Promise.all(
    records.map(async (r) => {
      let credentials: Record<string, unknown> | null = null;
      if (r.encrypted_credentials && cryptoKey) {
        try {
          credentials = JSON.parse(await decrypt(r.encrypted_credentials, cryptoKey));
        } catch {
          console.warn(`Failed to decrypt credentials for connection ${r.id}`);
        }
      }
      return {
        id: r.id,
        name: r.name,
        scope: r.scope,
        config: JSON.parse(r.config),
        credentials,
        environment: r.environment,
        created_at: r.created_at,
      };
    })
  );
}

export async function deleteConnection(id: string): Promise<void> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    await conn.query(`DELETE FROM connections WHERE id = ${sqlQuote(id)}`);
  } else {
    await fallbackDelete("connections", id);
  }
}
