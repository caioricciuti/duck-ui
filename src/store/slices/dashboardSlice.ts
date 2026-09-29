import type { StateCreator } from "@/store/createStore";
import { toast } from "svelte-sonner";
import { getSession } from "@/services/engine";
import { DatasetRunner } from "@/services/dashboard/queryRunner";
import { parseDashboardSource, starterSource, toQueryName } from "@/services/dashboard/markdown";
import { applyInputs, InputsStore, type InputValue } from "@/services/dashboard/inputs";
import type { Dashboard, DashboardDataset, ExecutionStrategy } from "@/services/dashboard/types";
import {
  deleteDashboard as deleteDashboardRepo,
  duplicateDashboard as duplicateDashboardRepo,
  listDashboards,
  newDashboard,
  saveDashboard,
} from "@/services/persistence/repositories/dashboardRepository";
import type { DashboardSlice, DuckStoreState } from "../types";

/**
 * Dashboard state.
 *
 * A dashboard is a markdown document (`services/dashboard/markdown.ts`); its
 * queries, charts and layout are all derived from `source`. The store holds
 * the documents; the runners hold live queries and result caches, which are
 * resources rather than state and so live outside Zustand, publishing to
 * components through their own subscription.
 */
const runners = new Map<string, DatasetRunner>();
const inputStores = new Map<string, InputsStore>();

/** Input state for one open dashboard. View state; never persisted. */
export const getDashboardInputs = (dashboardId: string): InputsStore => {
  let store = inputStores.get(dashboardId);
  if (!store) {
    store = new InputsStore();
    inputStores.set(dashboardId, store);
  }
  return store;
};

const resolveSession = (strategy: ExecutionStrategy) => {
  switch (strategy.mode) {
    case "local":
      return getSession(strategy.connectionId);
    case "peer":
      return getSession(strategy.capabilityId);
    case "auto":
      return strategy.capabilityId ? getSession(strategy.capabilityId) : null;
  }
};

export const getDashboardRunner = (dashboardId: string): DatasetRunner => {
  let runner = runners.get(dashboardId);
  if (!runner) {
    runner = new DatasetRunner(resolveSession);
    runners.set(dashboardId, runner);
  }
  return runner;
};

/**
 * Save bookkeeping per dashboard, for `updateDashboard`.
 *
 * `latestUpdate` names the newest call, so an older save that finishes late
 * cannot put its text back into the store. `saveQueues` runs the writes of
 * one dashboard one after the other, so storage ends on the newest too.
 */
const latestUpdate = new Map<string, number>();
const saveQueues = new Map<string, Promise<void>>();
let updateCounter = 0;

/** Whether one dashboard is in edit mode. Each open dashboard has its own. */
export const isDashboardEditing = (
  state: Pick<DashboardSlice, "dashboardEditing">,
  dashboardId: string
): boolean => state.dashboardEditing[dashboardId] === true;

const disposeRunner = (dashboardId: string): void => {
  runners.get(dashboardId)?.dispose();
  runners.delete(dashboardId);
  inputStores.delete(dashboardId);
};

/**
 * The datasets a document declares, derived from its source.
 *
 * A dataset's id IS its query name: stable across edits to other queries, and
 * readable in every error message and cache key.
 */
export const datasetsFor = (
  dashboard: Dashboard,
  inputs?: ReadonlyMap<string, InputValue>
): DashboardDataset[] =>
  parseDashboardSource(dashboard.source).queries.map((query) => ({
    id: query.name,
    name: query.name,
    // Inputs substitute before the engine sees the SQL. Because the cache key
    // is the final SQL, changing one input re-runs exactly the queries that
    // reference it and leaves the rest cached.
    sql: inputs ? applyInputs(query.sql, inputs) : query.sql,
    execution: dashboard.execution,
  }));

export const createDashboardSlice: StateCreator<DuckStoreState, [], [], DashboardSlice> = (
  set,
  get
) => ({
  dashboards: [],
  dashboardEditing: {},
  isDashboardsPanelOpen: false,

  loadDashboards: async (explicitProfileId?: string) => {
    // Accepts the id explicitly because `loadProfile` calls this BEFORE it
    // sets `currentProfileId` — reading the store here silently loaded
    // nothing on every reload, which presented as "my dashboard is gone".
    const profileId = explicitProfileId ?? get().currentProfileId;
    if (!profileId) return;
    try {
      set({ dashboards: await listDashboards(profileId) });
    } catch (error) {
      console.warn("[dashboard] failed to load:", error);
    }
  },

  createDashboard: async (name: string) => {
    const profileId = get().currentProfileId;
    if (!profileId) {
      toast.error("Create a profile before making a dashboard");
      return null;
    }
    const connectionId = get().currentConnection?.id ?? "WASM";
    const isSession = get().currentConnection?.environment === "SESSION";

    const created = await newDashboard(profileId, name);
    const dashboard: Dashboard = {
      ...created,
      source: starterSource(name),
      // Pinned at creation to wherever the author is connected; a report reads
      // from one place.
      execution: isSession
        ? { mode: "peer", capabilityId: connectionId }
        : { mode: "local", connectionId },
    };
    await saveDashboard(profileId, dashboard);
    set((state) => ({ dashboards: [dashboard, ...state.dashboards] }));
    return dashboard;
  },

  updateDashboard: async (dashboard: Dashboard) => {
    const profileId = get().currentProfileId;
    const token = ++updateCounter;
    latestUpdate.set(dashboard.id, token);
    const isLatest = () => latestUpdate.get(dashboard.id) === token;

    // Optimistic: the editor must feel immediate. Persistence catches up.
    set((state) => ({
      dashboards: state.dashboards.map((entry) => (entry.id === dashboard.id ? dashboard : entry)),
    }));
    if (!profileId) return;

    const save = async () => {
      // A newer edit is waiting behind this one and carries the whole
      // document, so writing this version would only be overwritten.
      if (!isLatest()) return;
      try {
        const saved = await saveDashboard(profileId, dashboard);
        // Edited again while this was saving: the store already holds newer
        // text, and putting this result there would roll it back.
        if (!isLatest()) return;
        set((state) => ({
          dashboards: state.dashboards.map((entry) => (entry.id === saved.id ? saved : entry)),
        }));
      } catch (error) {
        console.warn("[dashboard] failed to save:", error);
        // The locked-storage failure names its cause; surface it as-is so the
        // person knows which tab to close, rather than a generic shrug.
        toast.error(
          error instanceof Error && /another Duck-UI tab/.test(error.message)
            ? error.message
            : "Couldn't save the dashboard"
        );
      }
    };

    const queued = (saveQueues.get(dashboard.id) ?? Promise.resolve()).then(save);
    saveQueues.set(dashboard.id, queued);
    await queued;
    if (saveQueues.get(dashboard.id) === queued) saveQueues.delete(dashboard.id);
  },

  deleteDashboard: async (id: string) => {
    disposeRunner(id);
    // Supersedes a save still in flight, which would otherwise store the
    // dashboard again after it was deleted.
    latestUpdate.set(id, ++updateCounter);
    set((state) => ({
      dashboardEditing: Object.fromEntries(
        Object.entries(state.dashboardEditing).filter(([key]) => key !== id)
      ),
      dashboards: state.dashboards.filter((entry) => entry.id !== id),
      // A tab pointing at a deleted dashboard would render a dead end.
      tabs: state.tabs.filter((tab) => !(tab.type === "dashboard" && tab.content === id)),
    }));
    await deleteDashboardRepo(id);
  },

  duplicateDashboard: async (id: string) => {
    const profileId = get().currentProfileId;
    const source = get().dashboards.find((entry) => entry.id === id);
    if (!profileId || !source) return null;
    const copy = await duplicateDashboardRepo(profileId, source);
    set((state) => ({ dashboards: [copy, ...state.dashboards] }));
    return copy;
  },

  setDashboardEditing: (editing: boolean, dashboardId?: string) => {
    // Callers that do not name a dashboard mean the one in front of them.
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    const id =
      dashboardId ??
      (activeTab?.type === "dashboard" && typeof activeTab.content === "string"
        ? activeTab.content
        : undefined);
    if (!id) return;
    set((state) => ({ dashboardEditing: { ...state.dashboardEditing, [id]: editing } }));
  },

  setDashboardsPanelOpen: (open: boolean) => set({ isDashboardsPanelOpen: open }),

  /**
   * Appends a query and a component for it to a dashboard document.
   *
   * This is "Add to dashboard" from a result: the SQL becomes a named fence,
   * the visualization a tag bound to that name. Text in, text out — the author
   * can immediately edit what was generated.
   */
  appendQueryToDashboard: async (options) => {
    const dashboard = get().dashboards.find((entry) => entry.id === options.dashboardId);
    if (!dashboard) return;

    const parsed = parseDashboardSource(dashboard.source);
    const taken = new Set(parsed.queries.map((query) => query.name));
    const name = toQueryName(options.title, taken);

    const { columns } = options;
    const x = columns?.find((column) => !column.numeric)?.name ?? columns?.[0]?.name;
    const y =
      columns?.find((column) => column.numeric && column.name !== x)?.name ??
      columns?.find((column) => column.name !== x)?.name;
    const safeTitle = options.title.replace(/'/g, "");

    const component = (() => {
      switch (options.kind) {
        case "chart": {
          const type = options.chartConfig?.type;
          const tag = type === "line" ? "LineChart" : type === "area" ? "AreaChart" : "BarChart";
          const cx = options.chartConfig?.xAxis ?? x;
          const cy = options.chartConfig?.yAxis ?? y;
          return `<${tag} data={${name}}${cx ? ` x=${cx}` : ""}${cy ? ` y=${cy}` : ""} title='${safeTitle}'/>`;
        }
        case "metric":
          return `<BigValue data={${name}}${y ? ` value=${y}` : ""} agg=sum title='${safeTitle}'/>`;
        default:
          return `<DataTable data={${name}}/>`;
      }
    })();

    const addition = `\n\n## ${options.title}\n\n\`\`\`sql ${name}\n${options.sql.trim()}\n\`\`\`\n\n${component}\n`;

    await get().updateDashboard({
      ...dashboard,
      source: `${dashboard.source.trimEnd()}${addition}`,
    });

    get().openDashboardTab(dashboard.id, dashboard.name);
    toast.success(`Added to "${dashboard.name}"`);
  },

  /** Focuses the tab for a dashboard, opening one if it is not already open. */
  openDashboardTab: (dashboardId: string, name: string) => {
    const existing = get().tabs.find(
      (tab) => tab.type === "dashboard" && tab.content === dashboardId
    );
    if (existing) {
      get().setActiveTab(existing.id);
      return existing.id;
    }
    return get().createTab("dashboard", dashboardId, name);
  },

  runDashboard: async (dashboardId: string, force = false) => {
    const dashboard = get().dashboards.find((entry) => entry.id === dashboardId);
    if (!dashboard) return;

    const datasets = datasetsFor(dashboard, getDashboardInputs(dashboardId).snapshot());
    const runner = getDashboardRunner(dashboardId);
    if (force) {
      await runner.refreshAll(datasets);
      return;
    }
    await Promise.all(datasets.map((dataset) => runner.run(dataset)));
  },
});
