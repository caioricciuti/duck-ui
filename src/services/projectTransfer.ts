import { toast } from "svelte-sonner";
import { generateUUID } from "@/lib/utils";
import {
  buildBundleFiles,
  parseBundleFiles,
  planImport,
  type BundleDashboard,
  type BundleNotebook,
  type BundleQuery,
  type ImportPlan,
  type ProjectBundle,
} from "@/lib/projectBundle/format";
import { unzipBundle, zipBundle } from "@/lib/projectBundle/zip";
import {
  getSavedQueries,
  saveQuery,
  updateSavedQuery,
} from "@/services/persistence/repositories/savedQueryRepository";
import {
  listDashboards,
  saveDashboard,
} from "@/services/persistence/repositories/dashboardRepository";
import {
  createDashboard,
  type Dashboard,
  type ExecutionStrategy,
} from "@/services/dashboard/types";
import { useDuckStore } from "@/store";
import type { NotebookCell } from "@/store/types";

/**
 * Project export/import: the bridge between the pure bundle format
 * (`lib/projectBundle`) and where queries, notebooks and dashboards live.
 *
 * Reads only saved queries, notebook tabs and dashboards — never connections,
 * credentials or AI settings.
 */

const parseTags = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const parseCells = (content: unknown): NotebookCell[] => {
  if (typeof content !== "string") return [];
  try {
    const cells: unknown = JSON.parse(content);
    return Array.isArray(cells) ? (cells as NotebookCell[]) : [];
  } catch {
    return [];
  }
};

const notebookTabs = () => useDuckStore.getState().tabs.filter((tab) => tab.type === "notebook");

async function collectProject(profileId: string): Promise<ProjectBundle> {
  const [queries, dashboards] = await Promise.all([
    getSavedQueries(profileId),
    listDashboards(profileId),
  ]);

  return {
    queries: queries.map((query): BundleQuery => ({
      id: query.id,
      name: query.name,
      description: query.description,
      sql: query.sql_text,
      tags: parseTags(query.tags),
      folder: query.folder,
    })),
    notebooks: notebookTabs().map((tab): BundleNotebook => ({
      id: tab.id,
      title: tab.title,
      cells: parseCells(tab.content).map((cell) => ({
        type: cell.type,
        content: cell.content,
        ...(cell.collapsed ? { collapsed: true } : {}),
      })),
    })),
    dashboards: dashboards.map((dashboard): BundleDashboard => ({
      id: dashboard.id,
      name: dashboard.name,
      ...(dashboard.description ? { description: dashboard.description } : {}),
      source: dashboard.source,
      execution: dashboard.execution,
    })),
  };
}

export interface ProjectExport {
  blob: Blob;
  filename: string;
  counts: { queries: number; notebooks: number; dashboards: number };
}

export async function exportProject(profileId: string): Promise<ProjectExport> {
  const bundle = await collectProject(profileId);
  const now = new Date();
  const files = buildBundleFiles(bundle, {
    exportedAt: now.toISOString(),
    appVersion: typeof __DUCK_UI_VERSION__ === "string" ? __DUCK_UI_VERSION__ : undefined,
  });
  const bytes = await zipBundle(files);
  return {
    blob: new Blob([bytes as BlobPart], { type: "application/zip" }),
    filename: `duck-ui-project-${now.toISOString().slice(0, 10)}.zip`,
    counts: {
      queries: bundle.queries.length,
      notebooks: bundle.notebooks.length,
      dashboards: bundle.dashboards.length,
    },
  };
}

/** Builds the project zip and hands it to the browser as a download. */
export async function downloadProjectExport(profileId: string): Promise<void> {
  try {
    const { blob, filename, counts } = await exportProject(profileId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(
      `Exported ${counts.queries} queries, ${counts.notebooks} notebooks, ${counts.dashboards} dashboards`
    );
  } catch (error) {
    toast.error(`Export failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

/** Reads a bundle and works out what importing it would do, without writing. */
export async function previewProjectImport(profileId: string, file: Blob): Promise<ImportPlan> {
  const files = await unzipBundle(new Uint8Array(await file.arrayBuffer()));
  const bundle = parseBundleFiles(files);
  const [queries, dashboards] = await Promise.all([
    getSavedQueries(profileId),
    listDashboards(profileId),
  ]);
  return planImport(bundle, {
    queries: queries.map((query) => ({ id: query.id, name: query.name })),
    notebooks: notebookTabs().map((tab) => ({ id: tab.id, name: tab.title })),
    dashboards: dashboards.map((dashboard) => ({ id: dashboard.id, name: dashboard.name })),
  });
}

const toCells = (notebook: BundleNotebook): NotebookCell[] =>
  notebook.cells.map((cell) => ({
    id: generateUUID(),
    type: cell.type,
    content: cell.content,
    ...(cell.collapsed ? { collapsed: true } : {}),
  }));

const toExecution = (
  execution: BundleDashboard["execution"],
  fallback: ExecutionStrategy
): ExecutionStrategy => {
  if (execution?.mode === "local" && execution.connectionId) {
    return { mode: "local", connectionId: execution.connectionId };
  }
  if (execution?.mode === "peer" && execution.capabilityId) {
    return { mode: "peer", capabilityId: execution.capabilityId };
  }
  return fallback;
};

/**
 * Applies a previewed import.
 *
 * New records always get fresh ids: reusing the exported ones could clobber a
 * record another profile in this browser still owns. Re-importing still
 * merges, by name.
 */
export async function applyProjectImport(profileId: string, plan: ImportPlan): Promise<void> {
  const store = useDuckStore.getState();

  for (const { item, action, targetId } of plan.queries) {
    const tags = item.tags.length > 0 ? item.tags : undefined;
    if (action === "overwrite" && targetId) {
      await updateSavedQuery(targetId, {
        name: item.name,
        sql_text: item.sql,
        description: item.description,
        tags: tags ? JSON.stringify(tags) : null,
        folder: item.folder,
      });
    } else {
      await saveQuery(profileId, {
        name: item.name,
        sqlText: item.sql,
        description: item.description ?? undefined,
        tags,
        folder: item.folder,
      });
    }
  }
  if (plan.queries.length > 0) store.bumpSavedQueriesVersion();

  for (const { item, action, targetId } of plan.notebooks) {
    if (action === "overwrite" && targetId) {
      store.replaceNotebookCells(targetId, toCells(item));
      store.updateTabTitle(targetId, item.title);
    } else {
      store.createTab("notebook", JSON.stringify(toCells(item)), item.title);
    }
  }

  if (plan.dashboards.length > 0) {
    const existing = new Map((await listDashboards(profileId)).map((d) => [d.id, d]));
    for (const { item, action, targetId } of plan.dashboards) {
      const now = new Date().toISOString();
      const base: Dashboard =
        (action === "overwrite" && targetId && existing.get(targetId)) ||
        createDashboard(item.name, generateUUID(), now);
      await saveDashboard(profileId, {
        ...base,
        name: item.name,
        description: item.description,
        source: item.source,
        execution: toExecution(item.execution, base.execution),
      });
    }
    await store.loadDashboards(profileId);
  }
}
