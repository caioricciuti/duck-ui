import type { StateCreator } from "@/store/createStore";
import { toast } from "svelte-sonner";
import { generateUUID } from "@/lib/utils";
import { isGatedTabHidden } from "@/lib/appConfig";
import { disposePythonKernel } from "@/services/python/kernel";
import type { DuckStoreState, TabSlice, EditorTab, NotebookCell, NotebookCellType } from "../types";

function parseNotebookCells(tab: EditorTab): NotebookCell[] {
  if (tab.type !== "notebook" || typeof tab.content !== "string") return [];
  try {
    return JSON.parse(tab.content) as NotebookCell[];
  } catch {
    return [];
  }
}

function serializeCells(cells: NotebookCell[]): string {
  return JSON.stringify(cells, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

function createDefaultCell(type: NotebookCellType = "sql"): NotebookCell {
  return { id: generateUUID(), type, content: "" };
}

/** Badge-click cycle: SQL → Python → Markdown → SQL. Unknown types become SQL. */
function nextCellType(type: string): NotebookCellType {
  if (type === "sql") return "python";
  if (type === "python") return "markdown";
  return "sql";
}

function updateNotebookContent(
  tabs: EditorTab[],
  tabId: string,
  updater: (cells: NotebookCell[]) => NotebookCell[]
): EditorTab[] {
  return tabs.map((tab) => {
    if (tab.id !== tabId || tab.type !== "notebook") return tab;
    const cells = parseNotebookCells(tab);
    return { ...tab, content: serializeCells(updater(cells)) };
  });
}

export const createTabSlice: StateCreator<DuckStoreState, [], [], TabSlice> = (set, get) => ({
  tabs: [
    {
      id: "home",
      title: "Home",
      type: "home",
      content: "",
    },
  ],
  activeTabId: "home",

  createTab: (type = "sql", content = "", title) => {
    // Kiosk mode: refuse to open gated surfaces; keep the current tab focused.
    if (isGatedTabHidden(type)) {
      return get().activeTabId ?? "";
    }
    const isNotebook = type === "notebook";
    const defaultContent = isNotebook
      ? typeof content === "string" && content.trim().length > 0
        ? content
        : serializeCells([createDefaultCell("sql")])
      : content;
    const defaultTitle = isNotebook ? "Untitled Notebook" : "Untitled Query";

    const newTab: EditorTab = {
      id: generateUUID(),
      title: typeof title === "string" ? title : defaultTitle,
      type,
      content: defaultContent,
    };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
    return newTab.id;
  },

  closeTab: (tabId) => {
    // A notebook's Python kernel dies with its tab.
    disposePythonKernel(tabId);
    set((state) => {
      const updatedTabs = state.tabs.filter((tab) => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;
      if (updatedTabs.length === 0) {
        const newTab: EditorTab = {
          id: generateUUID(),
          title: "Query 1",
          type: "sql",
          content: "",
        };
        return {
          tabs: [newTab],
          activeTabId: newTab.id,
        };
      }
      if (state.activeTabId === tabId) {
        newActiveTabId = updatedTabs[0]?.id || null;
      }
      return {
        tabs: updatedTabs,
        activeTabId: newActiveTabId,
      };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateTabQuery: (tabId, query) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId && tab.type === "sql" ? { ...tab, content: query } : tab
      ),
    }));
  },

  updateTabTitle: (tabId, title) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab)),
    }));
  },

  updateTabChartConfig: (tabId, chartConfig) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, chartConfig } : tab)),
    }));
  },

  updateTabQueryParams: (tabId, updater) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, queryParams: updater(tab.queryParams ?? { values: {} }) } : tab
      ),
    }));
  },

  moveTab: (oldIndex, newIndex) => {
    set((state) => {
      const newTabs = [...state.tabs];
      const [movedTab] = newTabs.splice(oldIndex, 1);
      newTabs.splice(newIndex, 0, movedTab);
      return { tabs: newTabs };
    });
  },

  closeAllTabs: () => {
    try {
      set((state) => ({
        tabs: state.tabs.filter((tab) => tab.type === "home"),
        activeTabId: "home",
      }));
      toast.success("All tabs closed successfully!");
    } catch (error: unknown) {
      toast.error(
        `Failed to close tabs: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  // Notebook cell operations

  getNotebookCells: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    return tab ? parseNotebookCells(tab) : [];
  },

  replaceNotebookCells: (tabId, cells) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, () => cells),
    }));
  },

  addNotebookCell: (tabId, afterCellId, cellType = "sql") => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) => {
        const newCell = createDefaultCell(cellType);
        if (!afterCellId) return [...cells, newCell];
        const idx = cells.findIndex((c) => c.id === afterCellId);
        if (idx === -1) return [...cells, newCell];
        const result = [...cells];
        result.splice(idx + 1, 0, newCell);
        return result;
      }),
    }));
  },

  removeNotebookCell: (tabId, cellId) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) => {
        if (cells.length <= 1) return cells; // Keep at least one cell
        return cells.filter((c) => c.id !== cellId);
      }),
    }));
  },

  updateNotebookCellContent: (tabId, cellId, content) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) =>
        cells.map((c) => (c.id === cellId ? { ...c, content } : c))
      ),
    }));
  },

  updateNotebookCellResult: (tabId, cellId, result) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) =>
        cells.map((c) => (c.id === cellId ? { ...c, result } : c))
      ),
    }));
  },

  updateNotebookCellPythonOutput: (tabId, cellId, pythonOutput) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) =>
        cells.map((c) => (c.id === cellId ? { ...c, pythonOutput } : c))
      ),
    }));
  },

  updateNotebookCellChartConfig: (tabId, cellId, chartConfig) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) =>
        cells.map((c) => (c.id === cellId ? { ...c, chartConfig } : c))
      ),
    }));
  },

  moveNotebookCell: (tabId, cellId, direction) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) => {
        const idx = cells.findIndex((c) => c.id === cellId);
        if (idx === -1) return cells;
        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= cells.length) return cells;
        const result = [...cells];
        [result[idx], result[targetIdx]] = [result[targetIdx], result[idx]];
        return result;
      }),
    }));
  },

  toggleNotebookCellCollapsed: (tabId, cellId) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) =>
        cells.map((c) => (c.id === cellId ? { ...c, collapsed: !c.collapsed } : c))
      ),
    }));
  },

  toggleNotebookCellType: (tabId, cellId) => {
    set((state) => ({
      tabs: updateNotebookContent(state.tabs, tabId, (cells) =>
        cells.map((c) =>
          c.id === cellId
            ? {
                ...c,
                type: nextCellType(c.type),
                result: null,
                pythonOutput: null,
                chartConfig: undefined,
              }
            : c
        )
      ),
    }));
  },
});
