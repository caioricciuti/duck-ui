import type { StateCreator } from "@/store/createStore";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { toast } from "svelte-sonner";
import { getSession, requireLocalDuckSession, WASM_CONNECTION_ID } from "@/services/engine";
import {
  normalizeQuackHost,
  quackAttachStatements,
  quackDetachStatements,
  validateQuackAttachment,
  type QuackAttachment,
} from "@/lib/quack";
import {
  getQuackAttachments,
  saveQuackAttachments,
} from "@/services/persistence/repositories/quackRepository";
import type { DuckStoreState, QuackSlice } from "../types";

/**
 * Tokens of this profile's attachments, kept out of the store so they never
 * reach a snapshot, a devtools dump or a component. Needed to reconnect.
 */
const tokens = new Map<string, string>();

/** Attachments live on the built-in in-browser engine, whatever is active. */
const engineConnection = (): AsyncDuckDBConnection =>
  requireLocalDuckSession(getSession(WASM_CONNECTION_ID)).local.connection;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function attach(attachment: QuackAttachment, token: string): Promise<void> {
  const connection = engineConnection();
  try {
    for (const statement of quackAttachStatements(attachment, token)) {
      await connection.query(statement);
    }
  } catch (error) {
    // Leave no secret behind for an attachment that does not exist.
    await detach(attachment.alias);
    throw error;
  }
}

async function detach(alias: string): Promise<void> {
  const connection = engineConnection();
  for (const statement of quackDetachStatements(alias)) {
    try {
      await connection.query(statement);
    } catch (error) {
      console.warn(`[Quack] ${statement} failed:`, error);
    }
  }
}

export const createQuackSlice: StateCreator<DuckStoreState, [], [], QuackSlice> = (set, get) => {
  const persist = async (): Promise<void> => {
    const { currentProfileId, encryptionKey, quackAttachments } = get();
    if (!currentProfileId || !encryptionKey) return;
    const records = quackAttachments.flatMap(({ alias, host }) => {
      const token = tokens.get(alias);
      return token ? [{ alias, host, token }] : [];
    });
    await saveQuackAttachments(currentProfileId, records, encryptionKey);
  };

  const refreshCatalog = async (): Promise<void> => {
    if (get().currentConnection?.id === WASM_CONNECTION_ID) {
      await get().fetchDatabasesAndTablesInfo();
    }
  };

  const setStatus = (alias: string, error: string | null): void =>
    set((state) => ({
      quackAttachments: state.quackAttachments.map((a) =>
        a.alias === alias
          ? { ...a, status: error ? "failed" : "attached", error: error ?? undefined }
          : a
      ),
    }));

  return {
    quackAttachments: [],

    restoreQuackAttachments: async () => {
      // A profile switch keeps the engine running: the previous profile's
      // databases and tokens go before this one's come in.
      for (const { alias } of get().quackAttachments) await detach(alias);
      tokens.clear();
      set({ quackAttachments: [] });

      const { currentProfileId, encryptionKey } = get();
      if (!currentProfileId || !encryptionKey) return;
      const stored = await getQuackAttachments(currentProfileId, encryptionKey);
      set({
        quackAttachments: stored.map(({ alias, host }) => ({ alias, host, status: "failed" })),
      });
      // One at a time: they share the engine connection, and one server
      // being down must not keep the others from attaching.
      for (const { alias, host, token } of stored) {
        if (!token) {
          setStatus(alias, "The saved token could not be read. Remove and attach again.");
          continue;
        }
        tokens.set(alias, token);
        try {
          await attach({ alias, host }, token);
          setStatus(alias, null);
        } catch (error) {
          setStatus(alias, errorMessage(error));
        }
      }
    },

    attachQuack: async ({ alias, host, token }) => {
      const connection = engineConnection();
      const catalogs = await connection.query(`SELECT database_name FROM duckdb_databases()`);
      const taken = catalogs.toArray().map((row) => String(row.database_name));
      const attachment = { alias: alias.trim(), host: normalizeQuackHost(host) };
      const problem = validateQuackAttachment(
        { ...attachment, token },
        taken,
        get().quackAttachments
      );
      if (problem) throw new Error(problem);

      await attach(attachment, token);
      tokens.set(attachment.alias, token);
      set((state) => ({
        quackAttachments: [...state.quackAttachments, { ...attachment, status: "attached" }],
      }));
      if (!get().encryptionKey) {
        toast.warning("Attached until reload: this profile has no key to store the token with.");
      }
      await persist();
      await refreshCatalog();
    },

    reconnectQuack: async (alias) => {
      const attachment = get().quackAttachments.find((a) => a.alias === alias);
      const token = tokens.get(alias);
      if (!attachment || !token) return;
      await detach(alias);
      try {
        await attach(attachment, token);
        setStatus(alias, null);
      } catch (error) {
        setStatus(alias, errorMessage(error));
      }
      await refreshCatalog();
    },

    detachQuack: async (alias) => {
      await detach(alias);
      tokens.delete(alias);
      set((state) => ({
        quackAttachments: state.quackAttachments.filter((a) => a.alias !== alias),
      }));
      await persist();
      await refreshCatalog();
    },
  };
};
