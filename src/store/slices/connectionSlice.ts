import type { StateCreator } from "@/store/createStore";
import { toast } from "svelte-sonner";
import {
  asLocalDuckSession,
  closeSession,
  getSession,
  listSessions,
  openSession,
  testConnection,
  toConnectionDefinition,
  toCredentialMaterial,
  type DataSession,
} from "@/services/engine";
import type {
  ConnectionProvider,
  CurrentConnection,
  DuckStoreState,
  ConnectionSlice,
} from "../types";
import {
  saveConnection,
  updateConnection as updateConnectionRepo,
  deleteConnection as deleteConnectionRepo,
} from "@/services/persistence/repositories/connectionRepository";

/** Trims a provider record down to the fields the active-connection view keeps. */
export const toCurrentConnection = (provider: ConnectionProvider): CurrentConnection => ({
  environment: provider.environment,
  id: provider.id,
  name: provider.name,
  scope: provider.scope,
  host: provider.host,
  port: provider.port,
  user: provider.user,
  password: provider.password,
  database: provider.database,
  authMode: provider.authMode,
  apiKey: provider.apiKey,
  path: provider.path,
});

/** The catalog name shown in the UI for a connection. */
export const currentDatabaseLabel = (provider: ConnectionProvider): string => {
  switch (provider.scope) {
    case "OPFS":
      return provider.path?.replace(/\.db$/, "") || "opfs";
    case "External":
      return provider.database || "external";
    case "Peer":
      // Named for what it is, so the UI never implies the data is local.
      return "shared";
    default:
      return "memory";
  }
};

/**
 * DuckDB-WASM handles the store still projects for the code paths that
 * genuinely need an in-tab engine (file import, parquet export, deep links).
 * Null for any session that does not run here.
 */
export const localHandles = (
  session: DataSession | null
): { db: DuckStoreState["db"]; connection: DuckStoreState["connection"] } => {
  const local = asLocalDuckSession(session);
  return { db: local?.local.db ?? null, connection: local?.local.connection ?? null };
};

/**
 * Only one OPFS engine at a time.
 *
 * Each OPFS session is its own DuckDB-WASM instance holding an exclusive lock
 * on its file. Leaving the previous one open would pin ~34MB of WASM plus a
 * worker per database the user has ever visited, so switching away closes it.
 */
const closeOtherOpfsSessions = async (keepConnectionId: string): Promise<void> => {
  await Promise.all(
    listSessions()
      .filter((session) => session.kind === "opfs" && session.connectionId !== keepConnectionId)
      .map((session) => closeSession(session.connectionId))
  );
};

export const createConnectionSlice: StateCreator<DuckStoreState, [], [], ConnectionSlice> = (
  set,
  get
) => ({
  currentConnection: null,
  currentSession: null,
  connectionList: {
    connections: [],
  },
  isLoadingExternalConnection: false,

  addConnection: async (connection) => {
    try {
      set({ isLoadingExternalConnection: true, error: null });

      if (get().connectionList.connections.find((c) => c.name === connection.name)) {
        throw new Error(`A connection with the name "${connection.name}" already exists.`);
      }

      const definition = toConnectionDefinition(connection);
      const credentials = toCredentialMaterial(connection);

      if (definition.config.kind === "opfs") {
        // Opening IS the test for OPFS — a separate probe would pay the file
        // lock release wait twice. On success the new database becomes active,
        // which is what the user just asked for by adding it.
        await closeOtherOpfsSessions(definition.id);
        const session = await openSession(definition, credentials);
        set({
          ...localHandles(session),
          currentSession: session,
          currentConnection: toCurrentConnection(connection),
          currentDatabase: currentDatabaseLabel(connection),
        });
      } else if (definition.config.kind !== "wasm") {
        await testConnection(definition, credentials);
      }

      set((state) => ({
        connectionList: {
          connections: [...state.connectionList.connections, connection],
        },
      }));

      // Persist to DB (fire-and-forget)
      const { currentProfileId, encryptionKey } = get();
      if (currentProfileId) {
        const config: Record<string, unknown> = {
          host: connection.host,
          port: connection.port,
          database: connection.database,
          // Without it a password connection comes back after a reload with
          // no username, and every request is refused.
          user: connection.user,
          path: connection.path,
          authMode: connection.authMode,
        };
        const credentialRecord: Record<string, unknown> = {};
        if (connection.password) credentialRecord.password = connection.password;
        if (connection.apiKey) credentialRecord.apiKey = connection.apiKey;

        saveConnection(
          currentProfileId,
          {
            // Same id as the in-memory connection, or deleting it later in
            // this session would leave the stored row behind.
            id: connection.id,
            name: connection.name,
            scope: connection.scope ?? "External",
            config,
            credentials: Object.keys(credentialRecord).length > 0 ? credentialRecord : undefined,
            environment: connection.environment ?? "APP",
          },
          encryptionKey
        ).catch((err) => console.warn("[Connection] Failed to persist:", err));
      }

      toast.success(`Connection "${connection.name}" added successfully!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      set({ error: `Failed to add connection: ${errorMessage}` });
      toast.error(`Failed to add connection: ${errorMessage}`);
      throw error;
    } finally {
      set({ isLoadingExternalConnection: false });
    }
  },

  updateConnection: async (connection) => {
    const existing = get().connectionList.connections.find((c) => c.id === connection.id);
    if (!existing) return;

    // The form carries only the fields of its scope and always says "APP".
    // Whatever it does not edit keeps its value. A scope change starts clean,
    // so an OPFS database does not inherit the host of the server it replaced.
    const merged: ConnectionProvider = {
      ...(existing.scope === connection.scope ? existing : {}),
      ...connection,
      environment: existing.environment,
    };

    set((state) => ({
      connectionList: {
        connections: state.connectionList.connections.map((c) => (c.id === merged.id ? merged : c)),
      },
    }));

    // The open session was built from the old settings. Reopen it, or the
    // edit would only take effect after switching away and back.
    if (get().currentConnection?.id === merged.id) {
      await closeSession(merged.id).catch((error) =>
        console.warn("[Connection] Failed to close session before reconnecting:", error)
      );
      await get().setCurrentConnection(merged.id);
    }

    const { currentProfileId, encryptionKey } = get();
    if (!currentProfileId) return;

    const credentialRecord: Record<string, unknown> = {};
    if (merged.password) credentialRecord.password = merged.password;
    if (merged.apiKey) credentialRecord.apiKey = merged.apiKey;

    try {
      await updateConnectionRepo(
        currentProfileId,
        merged.id,
        {
          name: merged.name,
          scope: merged.scope,
          config: {
            host: merged.host,
            port: merged.port,
            database: merged.database,
            user: merged.user,
            path: merged.path,
            authMode: merged.authMode,
          },
          // Without a key nothing can be encrypted. Leaving the stored value
          // alone beats wiping credentials over a rename.
          credentials: !encryptionKey
            ? undefined
            : Object.keys(credentialRecord).length > 0
              ? credentialRecord
              : null,
          environment: merged.environment,
        },
        encryptionKey
      );
    } catch (error) {
      console.warn("[Connection] Failed to persist update:", error);
      toast.error(`Connection "${merged.name}" was changed but could not be saved.`);
    }
  },

  deleteConnection: (id) => {
    set((state) => ({
      connectionList: {
        connections: state.connectionList.connections.filter((c) => c.id !== id),
      },
    }));
    // Release the engine too — an OPFS file would otherwise stay locked by a
    // connection the user can no longer see.
    closeSession(id).catch((err) =>
      console.warn("[Connection] Failed to close session on delete:", err)
    );
    deleteConnectionRepo(id).catch((err) =>
      console.warn("[Connection] Failed to delete from DB:", err)
    );
  },

  setCurrentConnection: async (connectionId) => {
    try {
      set({ isLoading: true });
      const provider = get().connectionList.connections.find((c) => c.id === connectionId);
      if (!provider) {
        throw new Error(`Connection with ID ${connectionId} not found.`);
      }

      const definition = toConnectionDefinition(provider);

      if (definition.config.kind === "opfs") {
        if (!getSession(definition.id)) {
          toast.info("Initializing OPFS connection...");
        }
        await closeOtherOpfsSessions(definition.id);
      }

      const session = await openSession(definition, toCredentialMaterial(provider));

      set({
        ...localHandles(session),
        currentSession: session,
        currentConnection: toCurrentConnection(provider),
        currentDatabase: currentDatabaseLabel(provider),
      });

      try {
        await get().fetchDatabasesAndTablesInfo();
      } catch {
        // Schema fetch failure shouldn't prevent connection from completing
      }
      toast.success(`Connected to ${provider.name}`);
    } catch (error) {
      set({
        error: `Failed to set current connection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        isLoading: false,
      });
      toast.error(`Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      set({ isLoading: false });
    }
  },

  getConnection: (connectionId) => {
    return get().connectionList.connections.find((c) => c.id === connectionId);
  },
});
