import { create, type StateCreator } from "@/store/createStore";
import { createDuckdbSlice } from "./slices/duckdbSlice";
import { createConnectionSlice } from "./slices/connectionSlice";
import { createQuerySlice } from "./slices/querySlice";
import { createSchemaSlice } from "./slices/schemaSlice";
import { createTabSlice } from "./slices/tabSlice";
import { createDuckBrainSlice } from "./slices/duckBrainSlice";
import { createFileSystemSlice } from "./slices/fileSystemSlice";
import { createProfileSlice } from "./slices/profileSlice";
import { createSessionSlice } from "./slices/sessionSlice";
import { createDashboardSlice } from "./slices/dashboardSlice";
import { createResultPinSlice } from "./slices/resultPinSlice";
import { saveWorkspace } from "@/services/persistence/repositories/workspaceRepository";
import {
  saveProviderConfig,
  saveConversation,
} from "@/services/persistence/repositories/aiConfigRepository";
import { isSystemDbInitialized } from "@/services/persistence/systemDb";
import type { DuckStoreState } from "./types";

// Re-export all types from the centralized types file
export * from "./types";

const storeCreator: StateCreator<DuckStoreState> = (...a) => ({
  ...createDuckdbSlice(...a),
  ...createConnectionSlice(...a),
  ...createQuerySlice(...a),
  ...createSchemaSlice(...a),
  ...createTabSlice(...a),
  ...createDuckBrainSlice(...a),
  ...createFileSystemSlice(...a),
  ...createProfileSlice(...a),
  ...createSessionSlice(...a),
  ...createDashboardSlice(...a),
  ...createResultPinSlice(...a),
});

export const useDuckStore = create<DuckStoreState>()(storeCreator);

// ─── Auto-save: debounced writes to system DB ────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout>;
let lastSavedTabs: string | undefined;
let lastSavedAiProvider: string | undefined;
let lastSavedMessages: number | undefined;

async function persistWorkspaceState(state: DuckStoreState): Promise<void> {
  const { currentProfileId, encryptionKey, isProfileLoaded } = state;
  if (!currentProfileId || !isProfileLoaded || !isSystemDbInitialized()) return;

  try {
    // Save workspace (tabs, active tab, current DB)
    const tabsJson = JSON.stringify(
      state.tabs.map((tab) => {
        if (tab.type === "notebook" && typeof tab.content === "string") {
          try {
            const cells = JSON.parse(tab.content) as Array<Record<string, unknown>>;
            const cleanCells = cells.map((c) => ({
              ...c,
              result: undefined,
              pythonOutput: undefined,
            }));
            return { ...tab, result: undefined, content: JSON.stringify(cleanCells) };
          } catch {
            return { ...tab, result: undefined };
          }
        }
        return { ...tab, result: undefined };
      })
    );
    if (tabsJson !== lastSavedTabs) {
      await saveWorkspace(currentProfileId, {
        tabs: tabsJson,
        activeTabId: state.activeTabId,
        currentConnectionId: state.currentConnection?.id ?? null,
        currentDatabase: state.currentDatabase ?? null,
      });
      lastSavedTabs = tabsJson;
    }

    // Save AI provider configs when changed
    const currentProvider = state.duckBrain.aiProvider;
    if (currentProvider !== lastSavedAiProvider) {
      const configs = state.duckBrain.providerConfigs;
      for (const [provider, config] of Object.entries(configs)) {
        if (config) {
          const apiKey = "apiKey" in config ? (config.apiKey as string) : null;
          const safeConfig: Record<string, unknown> = {
            modelId: (config as Record<string, unknown>).modelId,
          };
          if ("baseUrl" in config) safeConfig.baseUrl = config.baseUrl;
          await saveProviderConfig(
            currentProfileId,
            provider,
            safeConfig,
            apiKey ?? null,
            encryptionKey
          );
        }
      }
      lastSavedAiProvider = currentProvider;
    }

    // Save AI messages when changed
    const messageCount = state.duckBrain.messages.length;
    if (messageCount !== lastSavedMessages && messageCount > 0) {
      await saveConversation(currentProfileId, state.duckBrain.messages, {
        id: `${currentProfileId}-default`,
        title: "Default conversation",
        provider: state.duckBrain.aiProvider,
      });
      lastSavedMessages = messageCount;
    }
  } catch (error) {
    console.warn("[AutoSave] Failed to persist state:", error);
  }
}

let autoSaveUnsubscribe: (() => void) | null = null;

/** Milliseconds of quiet before a change is written. */
const SAVE_DELAY_MS = 2000;

/** A change is waiting for its debounce, or a write is in flight. */
let savePending = false;
let saveInFlight: Promise<void> | null = null;

/**
 * True when the two states differ in something that is persisted. Query
 * progress, schema loads and the like change the store all the time and must
 * not count as unsaved work.
 */
export function changesPersistedState(previous: DuckStoreState, next: DuckStoreState): boolean {
  return (
    previous.tabs !== next.tabs ||
    previous.activeTabId !== next.activeTabId ||
    previous.currentConnection?.id !== next.currentConnection?.id ||
    previous.currentDatabase !== next.currentDatabase ||
    previous.duckBrain.aiProvider !== next.duckBrain.aiProvider ||
    previous.duckBrain.providerConfigs !== next.duckBrain.providerConfigs ||
    previous.duckBrain.messages !== next.duckBrain.messages
  );
}

function save(): Promise<void> {
  clearTimeout(saveTimer);
  savePending = false;
  const write = (saveInFlight ?? Promise.resolve())
    .then(() => persistWorkspaceState(useDuckStore.getState()))
    .finally(() => {
      if (saveInFlight === write) saveInFlight = null;
    });
  saveInFlight = write;
  return write;
}

export function startAutoSave(): void {
  // Prevent duplicate subscriptions
  if (autoSaveUnsubscribe) return;
  autoSaveUnsubscribe = useDuckStore.subscribe((state, previous) => {
    if (!state.isProfileLoaded || !changesPersistedState(previous, state)) return;
    savePending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
  });
}

/** True while an edit has not reached storage yet. */
export function hasUnsavedChanges(): boolean {
  return savePending || saveInFlight !== null;
}

/** Writes pending changes now and resolves once they are stored. */
export function flushAutoSave(): Promise<void> {
  if (!useDuckStore.getState().isProfileLoaded) return Promise.resolve();
  if (!savePending) return saveInFlight ?? Promise.resolve();
  return save();
}

if (typeof window !== "undefined") {
  // Leaving the tab is the moment to write: switching away, minimising, or
  // starting to close. By the time the page unloads there is then nothing
  // left to lose, and nothing to ask about.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushAutoSave();
  });
  window.addEventListener("pagehide", () => void flushAutoSave());
}
