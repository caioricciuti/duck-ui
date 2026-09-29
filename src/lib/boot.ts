import type { Profile } from "@/store/types";
import { useDuckStore, startAutoSave } from "@/store";
import { initializeSystemDb } from "@/services/persistence/systemDb";
import { cleanupOrphanedStorage } from "@/services/persistence/cleanup";
import { listProfiles } from "@/services/persistence/repositories/profileRepository";

export type ProfileBoot = { kind: "ready" } | { kind: "picker"; profiles: Profile[] };

/**
 * Initializes the system database and loads the user's profile before the
 * main app starts. A single unprotected profile loads on its own; anything
 * else (none, several, or one behind a password) goes to the picker.
 */
export async function bootProfile(): Promise<ProfileBoot> {
  await initializeSystemDb();
  // Clears storage left by removed features (see cleanup.ts). Never blocks boot.
  cleanupOrphanedStorage().catch(() => {});
  const profiles = await listProfiles();

  if (profiles.length === 1 && !profiles[0].has_password) {
    await useDuckStore.getState().loadProfile(profiles[0].id);
    startAutoSave();
    return { kind: "ready" };
  }

  return {
    kind: "picker",
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      avatarEmoji: p.avatar_emoji,
      hasPassword: p.has_password,
      createdAt: p.created_at,
      lastActive: p.last_active,
    })),
  };
}

export async function selectProfile(profileId: string, password?: string): Promise<void> {
  await useDuckStore.getState().loadProfile(profileId, password);
  startAutoSave();
}

export async function createAndLoadProfile(
  name: string,
  password?: string,
  avatarEmoji?: string
): Promise<string> {
  const id = await useDuckStore.getState().createProfile(name, password, avatarEmoji);
  await migrateFromLocalStorage(id);
  await useDuckStore.getState().loadProfile(id, password);
  startAutoSave();
  return id;
}

/** True when a SQL tab holds text, which is what the unload prompt guards. */
export function hasUnsavedWork(): boolean {
  return useDuckStore
    .getState()
    .tabs.some(
      (t) => t.type === "sql" && typeof t.content === "string" && t.content.trim().length > 0
    );
}

/**
 * Migrate existing localStorage state to the system database.
 * One-time operation on first boot after the profile system is introduced.
 */
export async function migrateFromLocalStorage(profileId: string): Promise<void> {
  if (localStorage.getItem("duck-ui-migrated") === "true") return;

  const raw = localStorage.getItem("duck-ui-storage");
  if (!raw) {
    localStorage.setItem("duck-ui-migrated", "true");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const state = parsed.state ?? parsed;

    const { saveWorkspace } =
      await import("@/services/persistence/repositories/workspaceRepository");
    const { addHistoryEntry } =
      await import("@/services/persistence/repositories/queryHistoryRepository");
    const { saveProviderConfig, saveConversation } =
      await import("@/services/persistence/repositories/aiConfigRepository");
    const { setSetting } = await import("@/services/persistence/repositories/settingsRepository");
    const { saveConnection } =
      await import("@/services/persistence/repositories/connectionRepository");
    const { loadKeyForProfile } = await import("@/services/persistence/crypto");

    // Load the encryption key for this profile
    const keyData = await loadKeyForProfile(profileId);
    const cryptoKey = keyData?.key ?? null;

    // Migrate connections
    const connections = state.connectionList?.connections ?? [];
    for (const conn of connections) {
      if (!conn.id || conn.scope === "WASM") continue;
      const config: Record<string, unknown> = {
        host: conn.host,
        port: conn.port,
        database: conn.database,
        path: conn.path,
        authMode: conn.authMode,
      };
      const credentials: Record<string, unknown> = {};
      if (conn.password) credentials.password = conn.password;
      if (conn.apiKey) credentials.apiKey = conn.apiKey;

      await saveConnection(
        profileId,
        {
          // Same id as the in-memory connection, so a delete in this session finds the row.
          id: conn.id,
          name: conn.name ?? "Untitled",
          scope: conn.scope ?? "External",
          config,
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
          environment: conn.environment ?? "APP",
        },
        cryptoKey
      );
    }

    // Migrate query history
    for (const item of state.queryHistory ?? []) {
      await addHistoryEntry(profileId, item.query, {
        error: item.error,
      });
    }

    // Migrate workspace state (tabs)
    if (state.tabs) {
      const tabsJson = JSON.stringify(
        state.tabs.map((t: Record<string, unknown>) => ({ ...t, result: undefined }))
      );
      await saveWorkspace(profileId, {
        tabs: tabsJson,
        activeTabId: (state.activeTabId as string) ?? null,
        currentConnectionId:
          ((state.currentConnection as Record<string, unknown>)?.id as string) ?? null,
        currentDatabase: (state.currentDatabase as string) ?? null,
      });
    }

    // Migrate AI provider configs
    const providerConfigs = state.duckBrain?.providerConfigs ?? {};
    for (const [provider, config] of Object.entries(providerConfigs)) {
      if (!config) continue;
      const cfg = config as Record<string, string>;
      const apiKey = cfg.apiKey ?? null;
      const safeConfig: Record<string, unknown> = { modelId: cfg.modelId };
      if (cfg.baseUrl) safeConfig.baseUrl = cfg.baseUrl;
      await saveProviderConfig(profileId, provider, safeConfig, apiKey, cryptoKey);
    }

    // Migrate AI messages
    if (state.duckBrain?.messages?.length) {
      await saveConversation(profileId, state.duckBrain.messages, {
        title: "Migrated conversation",
        provider: state.duckBrain.aiProvider,
      });
    }

    // Migrate theme
    const theme = localStorage.getItem("vite-ui-theme");
    if (theme) {
      await setSetting(profileId, "theme", "mode", JSON.stringify(theme));
    }

    console.info("[Migration] Successfully migrated localStorage data to system DB");
  } catch (error) {
    console.warn("[Migration] Failed to migrate localStorage:", error);
  }

  localStorage.setItem("duck-ui-migrated", "true");
}
