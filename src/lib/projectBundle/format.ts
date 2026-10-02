/**
 * Git-friendly project bundles.
 *
 * A bundle is a folder of plain files — one `.sql` per saved query, one `.md`
 * per notebook and per dashboard — plus a `duck-ui.json` manifest carrying ids
 * so a re-import updates rather than duplicates. Every file reads and diffs
 * cleanly in a repository, and a hand-written file without a manifest entry
 * still imports.
 *
 * Only descriptions of work travel: SQL, notebook cells and dashboard
 * documents. Connections, credentials, API keys and AI settings are never
 * part of the model here, so they cannot leak into an export. Notebook
 * results and chart settings are dropped too — a bundle holds questions, not
 * answers.
 *
 * Everything in this module is pure: the zip container and the persistence
 * side live elsewhere.
 */

export const BUNDLE_FORMAT = "duck-ui-project";
export const BUNDLE_VERSION = 1;
export const MANIFEST_PATH = "duck-ui.json";

export interface BundleQuery {
  id?: string;
  name: string;
  description: string | null;
  sql: string;
  tags: string[];
  folder: string;
}

export interface BundleNotebookCell {
  type: "sql" | "python" | "markdown";
  content: string;
  collapsed?: boolean;
}

export interface BundleNotebook {
  id?: string;
  title: string;
  cells: BundleNotebookCell[];
}

export interface BundleDashboardExecution {
  mode: "local" | "peer" | "auto";
  connectionId?: string;
  capabilityId?: string;
}

export interface BundleDashboard {
  id?: string;
  name: string;
  description?: string;
  source: string;
  execution?: BundleDashboardExecution;
}

export interface ProjectBundle {
  queries: BundleQuery[];
  notebooks: BundleNotebook[];
  dashboards: BundleDashboard[];
}

interface ManifestEntry {
  id: string;
  path: string;
}

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt?: string;
  appVersion?: string;
  queries: ManifestEntry[];
  notebooks: (ManifestEntry & { title: string })[];
  dashboards: (ManifestEntry & {
    name: string;
    description?: string;
    execution?: BundleDashboardExecution;
  })[];
}

//
// Slugs
//

/** Filesystem-safe, lowercase slug. Never empty. */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

//
// Files end with exactly one newline, which parsing removes again, so content
// round-trips byte for byte whether or not it had a trailing newline itself.
//

const withFinalNewline = (text: string): string => `${text}\n`;
const withoutFinalNewline = (text: string): string =>
  text.endsWith("\n") ? text.slice(0, -1) : text;

const normalizeNewlines = (text: string): string => text.replace(/\r\n?/g, "\n");

const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, " ").trim();

//
// Queries: `-- key: value` header, a blank line, then the SQL verbatim.
//

const HEADER_LINE = /^-- (name|description|tags|folder):(?: (.*))?$/;

/** Either form the serializer writes: a JSON array, or names separated by commas. */
function parseTags(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter(Boolean);
      }
    } catch {
      // Not JSON after all: a tag list that happens to start with a bracket.
    }
  }
  return trimmed
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function serializeQuery(query: BundleQuery): string {
  const header = [`-- name: ${oneLine(query.name)}`];
  if (query.description) {
    for (const line of normalizeNewlines(query.description).split("\n")) {
      header.push(line ? `-- description: ${line}` : "-- description:");
    }
  }
  if (query.tags.length > 0) {
    // A comma inside a tag would read back as two tags, so such a list is
    // written as JSON; the plain form stays for every other file.
    const tags = query.tags.map(oneLine);
    header.push(
      `-- tags: ${tags.some((tag) => tag.includes(",")) ? JSON.stringify(tags) : tags.join(", ")}`
    );
  }
  if (query.folder && query.folder !== "default")
    header.push(`-- folder: ${oneLine(query.folder)}`);
  return withFinalNewline(`${header.join("\n")}\n\n${query.sql}`);
}

export function parseQuery(text: string, fallbackName: string): BundleQuery {
  const lines = withoutFinalNewline(normalizeNewlines(text)).split("\n");
  let name: string | null = null;
  const description: string[] = [];
  let tags: string[] = [];
  let folder = "default";

  let index = 0;
  for (; index < lines.length; index++) {
    const match = HEADER_LINE.exec(lines[index]);
    if (!match) break;
    const value = match[2] ?? "";
    switch (match[1]) {
      case "name":
        name = value.trim();
        break;
      case "description":
        description.push(value);
        break;
      case "tags":
        tags = parseTags(value);
        break;
      case "folder":
        folder = value.trim() || "default";
        break;
    }
  }
  // The blank separator belongs to the header, not the SQL.
  if (index > 0 && lines[index] === "") index++;

  return {
    name: name || fallbackName,
    description: description.length > 0 ? description.join("\n") : null,
    sql: lines.slice(index).join("\n"),
    tags,
    folder,
  };
}

//
// Notebooks: a `# Title`, then each cell after a `<!-- cell:… -->` marker.
// Code cells are fenced ```sql / ```python blocks, so the file renders as a
// readable document on any markdown host.
//

const CELL_MARKER = /^<!-- cell:(sql|python|markdown)( collapsed)? -->$/;
const CODE_FENCE_OPEN = /^(`{3,}|~{3,})\s*(sql|python|py)\b.*$/i;
/** A content line that is a marker, or a marker already behind backslashes. */
const MARKER_LIKE_LINE = /^(\\*)(<!-- cell:(?:sql|python|markdown)(?: collapsed)? -->)$/;

/**
 * A cell whose text contains a line that is exactly a cell marker would be
 * cut in two on import. Such a line gets one more backslash in the file
 * (so lines that already start with backslashes stay distinct), and
 * `unescapeMarkers` takes one away. Files from before this never contain
 * the escaped form, so they read as they always did.
 */
function escapeMarkers(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(MARKER_LIKE_LINE, "\\$1$2"))
    .join("\n");
}

function unescapeMarkers(content: string): string {
  return content
    .split("\n")
    .map((line) => (MARKER_LIKE_LINE.test(line) && line.startsWith("\\") ? line.slice(1) : line))
    .join("\n");
}

type CodeCellType = "sql" | "python";

function fenceLanguage(tag: string): CodeCellType {
  return tag.toLowerCase() === "sql" ? "sql" : "python";
}

/** A fence longer than any backtick run in the content, per CommonMark. */
function fenceFor(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function serializeNotebook(notebook: BundleNotebook): string {
  const parts = [`# ${oneLine(notebook.title) || "Untitled Notebook"}`];
  for (const cell of notebook.cells) {
    const marker = `<!-- cell:${cell.type}${cell.collapsed ? " collapsed" : ""} -->`;
    const content = escapeMarkers(cell.content);
    if (cell.type === "sql" || cell.type === "python") {
      const fence = fenceFor(content);
      parts.push(`${marker}\n${fence}${cell.type}\n${content}\n${fence}`);
    } else {
      parts.push(`${marker}\n${content}`);
    }
  }
  return withFinalNewline(parts.join("\n\n"));
}

function parseCodeBody(lines: string[]): string {
  const open = CODE_FENCE_OPEN.exec(lines[0] ?? "");
  if (!open) return lines.join("\n");
  const fence = open[1];
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === fence);
  return lines.slice(1, close === -1 ? lines.length : close).join("\n");
}

/** Plain markdown without cell markers: ```sql / ```python fences become code cells. */
function parseLooseNotebook(lines: string[]): BundleNotebookCell[] {
  const cells: BundleNotebookCell[] = [];
  let prose: string[] = [];
  const flushProse = () => {
    const text = prose.join("\n").trim();
    if (text) cells.push({ type: "markdown", content: text });
    prose = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const open = CODE_FENCE_OPEN.exec(lines[i]);
    if (!open) {
      prose.push(lines[i]);
      continue;
    }
    flushProse();
    const fence = open[1];
    const body: string[] = [];
    for (i++; i < lines.length && lines[i].trim() !== fence; i++) body.push(lines[i]);
    cells.push({ type: fenceLanguage(open[2]), content: body.join("\n") });
  }
  flushProse();
  return cells;
}

export function parseNotebook(text: string, fallbackTitle: string): BundleNotebook {
  const lines = withoutFinalNewline(normalizeNewlines(text)).split("\n");
  const markers = lines.flatMap((line, index) => (CELL_MARKER.test(line) ? [index] : []));

  const preambleEnd = markers.length > 0 ? markers[0] : lines.length;
  const titleIndex = lines.slice(0, preambleEnd).findIndex((line) => line.trim() !== "");
  const titleMatch = titleIndex === -1 ? null : /^#\s+(.*)$/.exec(lines[titleIndex]);
  const title = titleMatch?.[1].trim() || fallbackTitle;

  if (markers.length === 0) {
    const rest = titleMatch ? lines.slice(titleIndex + 1) : lines;
    return { title, cells: parseLooseNotebook(rest) };
  }

  const cells = markers.map((start, i): BundleNotebookCell => {
    const [, type, collapsed] = CELL_MARKER.exec(lines[start]) ?? [];
    const isLast = i === markers.length - 1;
    const end = isLast ? lines.length : markers[i + 1];
    const body = lines.slice(start + 1, end);
    // Cells are joined by one blank line, which is not part of either cell.
    if (!isLast && body.length > 0 && body[body.length - 1] === "") body.pop();
    const cellType = type === "sql" || type === "python" ? type : "markdown";
    return {
      type: cellType,
      content: unescapeMarkers(cellType === "markdown" ? body.join("\n") : parseCodeBody(body)),
      ...(collapsed ? { collapsed: true } : {}),
    };
  });

  return { title, cells };
}

//
// Dashboards are already markdown documents: the file is the source.
//

export const serializeDashboard = (dashboard: BundleDashboard): string =>
  withFinalNewline(dashboard.source);

export const parseDashboard = (text: string): string =>
  withoutFinalNewline(normalizeNewlines(text));

function headingOf(source: string): string | null {
  const match = /^#\s+(.+)$/m.exec(source);
  return match ? match[1].trim() : null;
}

//
// Whole bundles
//

export function buildBundleFiles(
  bundle: ProjectBundle,
  options: { exportedAt?: string; appVersion?: string } = {}
): Record<string, string> {
  const files: Record<string, string> = {};
  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    ...(options.exportedAt ? { exportedAt: options.exportedAt } : {}),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    queries: [],
    notebooks: [],
    dashboards: [],
  };

  const querySlugs = new Set<string>();
  for (const query of bundle.queries) {
    const path = `queries/${uniqueSlug(query.name, querySlugs)}.sql`;
    files[path] = serializeQuery(query);
    if (query.id) manifest.queries.push({ id: query.id, path });
  }

  const notebookSlugs = new Set<string>();
  for (const notebook of bundle.notebooks) {
    const path = `notebooks/${uniqueSlug(notebook.title, notebookSlugs)}.md`;
    files[path] = serializeNotebook(notebook);
    if (notebook.id) manifest.notebooks.push({ id: notebook.id, path, title: notebook.title });
  }

  const dashboardSlugs = new Set<string>();
  for (const dashboard of bundle.dashboards) {
    const path = `dashboards/${uniqueSlug(dashboard.name, dashboardSlugs)}.md`;
    files[path] = serializeDashboard(dashboard);
    manifest.dashboards.push({
      id: dashboard.id ?? "",
      path,
      name: dashboard.name,
      ...(dashboard.description ? { description: dashboard.description } : {}),
      ...(dashboard.execution ? { execution: dashboard.execution } : {}),
    });
  }

  files[MANIFEST_PATH] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
}

function readManifest(raw: string | undefined): BundleManifest | null {
  if (raw === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${MANIFEST_PATH} is not valid JSON`);
  }
  const manifest = parsed as Partial<BundleManifest> | null;
  if (!manifest || manifest.format !== BUNDLE_FORMAT) {
    throw new Error(`${MANIFEST_PATH} is not a Duck-UI project manifest`);
  }
  if (typeof manifest.version !== "number" || manifest.version > BUNDLE_VERSION) {
    throw new Error("This project was exported by a newer version of Duck-UI");
  }
  return {
    format: BUNDLE_FORMAT,
    version: manifest.version,
    queries: Array.isArray(manifest.queries) ? manifest.queries : [],
    notebooks: Array.isArray(manifest.notebooks) ? manifest.notebooks : [],
    dashboards: Array.isArray(manifest.dashboards) ? manifest.dashboards : [],
  };
}

const stem = (path: string): string => {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.[^.]+$/, "");
};

/**
 * Reads bundle files back. Paths may sit under one top-level folder (as when
 * a repository directory is zipped), which is stripped.
 */
export function parseBundleFiles(input: Record<string, string>): ProjectBundle {
  const files = stripCommonRoot(input);
  const manifest = readManifest(files[MANIFEST_PATH]);
  const idFor = (entries: ManifestEntry[] | undefined, path: string) =>
    entries?.find((entry) => entry.path === path)?.id || undefined;

  const bundle: ProjectBundle = { queries: [], notebooks: [], dashboards: [] };
  for (const path of Object.keys(files).sort()) {
    const text = files[path];
    if (/^queries\/[^/]+\.sql$/i.test(path)) {
      const query = parseQuery(text, stem(path));
      const id = idFor(manifest?.queries, path);
      bundle.queries.push(id ? { id, ...query } : query);
    } else if (/^notebooks\/[^/]+\.md$/i.test(path)) {
      const entry = manifest?.notebooks.find((item) => item.path === path);
      const notebook = parseNotebook(text, entry?.title || stem(path));
      bundle.notebooks.push(entry?.id ? { id: entry.id, ...notebook } : notebook);
    } else if (/^dashboards\/[^/]+\.md$/i.test(path)) {
      const entry = manifest?.dashboards.find((item) => item.path === path);
      const source = parseDashboard(text);
      bundle.dashboards.push({
        ...(entry?.id ? { id: entry.id } : {}),
        name: entry?.name || headingOf(source) || stem(path),
        ...(entry?.description ? { description: entry.description } : {}),
        source,
        ...(entry?.execution ? { execution: entry.execution } : {}),
      });
    }
  }
  return bundle;
}

function stripCommonRoot(files: Record<string, string>): Record<string, string> {
  const paths = Object.keys(files).filter((path) => !path.endsWith("/"));
  if (paths.length === 0 || paths.some((path) => path === MANIFEST_PATH)) return files;
  const roots = new Set(paths.map((path) => path.split("/")[0]));
  if (roots.size !== 1) return files;
  const [root] = roots;
  if (["queries", "notebooks", "dashboards"].includes(root)) return files;
  return Object.fromEntries(paths.map((path) => [path.slice(root.length + 1), files[path]]));
}

//
// Import planning: merge by id, else by name.
//

export type ImportAction = "create" | "overwrite";

export interface ImportPlanItem<T> {
  item: T;
  action: ImportAction;
  /** The existing record to overwrite. Absent when creating. */
  targetId?: string;
}

export interface ImportPlan {
  queries: ImportPlanItem<BundleQuery>[];
  notebooks: ImportPlanItem<BundleNotebook>[];
  dashboards: ImportPlanItem<BundleDashboard>[];
}

export interface ExistingItems {
  queries: { id: string; name: string }[];
  notebooks: { id: string; name: string }[];
  dashboards: { id: string; name: string }[];
}

function planKind<T>(
  items: T[],
  existing: { id: string; name: string }[],
  key: (item: T) => { id?: string; name: string }
): ImportPlanItem<T>[] {
  const claimed = new Set<string>();
  return items.map((item) => {
    const { id, name } = key(item);
    const target =
      (id && existing.find((entry) => entry.id === id && !claimed.has(entry.id))) ||
      existing.find((entry) => entry.name === name && !claimed.has(entry.id));
    if (!target) return { item, action: "create" };
    // One existing record is overwritten at most once per import.
    claimed.add(target.id);
    return { item, action: "overwrite", targetId: target.id };
  });
}

export function planImport(bundle: ProjectBundle, existing: ExistingItems): ImportPlan {
  return {
    queries: planKind(bundle.queries, existing.queries, (q) => q),
    notebooks: planKind(bundle.notebooks, existing.notebooks, (n) => ({
      id: n.id,
      name: n.title,
    })),
    dashboards: planKind(bundle.dashboards, existing.dashboards, (d) => d),
  };
}
