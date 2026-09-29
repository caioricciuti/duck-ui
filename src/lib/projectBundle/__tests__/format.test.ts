import { describe, it, expect } from "vitest";
import {
  buildBundleFiles,
  MANIFEST_PATH,
  parseBundleFiles,
  parseNotebook,
  parseQuery,
  planImport,
  serializeNotebook,
  serializeQuery,
  slugify,
  type BundleNotebook,
  type BundleQuery,
  type ProjectBundle,
} from "../format";
import { unzipBundle, zipBundle } from "../zip";

const query = (overrides: Partial<BundleQuery> = {}): BundleQuery => ({
  name: "Top customers",
  description: null,
  sql: "SELECT * FROM customers\nORDER BY revenue DESC\nLIMIT 10;",
  tags: [],
  folder: "default",
  ...overrides,
});

describe("slugify", () => {
  it("produces filesystem-safe names", () => {
    expect(slugify("Top Customers (2024)!")).toBe("top-customers-2024");
    expect(slugify("Café résumé")).toBe("cafe-resume");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("   ")).toBe("untitled");
  });
});

describe("queries", () => {
  it("writes a readable comment header", () => {
    const text = serializeQuery(
      query({ description: "Best buyers", tags: ["sales", "weekly"], folder: "reports" })
    );
    expect(text).toBe(
      "-- name: Top customers\n-- description: Best buyers\n-- tags: sales, weekly\n-- folder: reports\n\nSELECT * FROM customers\nORDER BY revenue DESC\nLIMIT 10;\n"
    );
  });

  it.each([
    ["plain", query()],
    ["described", query({ description: "line one\n\nline three", tags: ["a", "b"] })],
    ["trailing newline", query({ sql: "SELECT 1\n" })],
    ["leading blank lines", query({ sql: "\n\nSELECT 1" })],
    ["empty", query({ sql: "" })],
    ["header-like SQL", query({ sql: "-- name: not a header\nSELECT 1" })],
    ["folder", query({ folder: "team/finance" })],
  ])("round-trips %s", (_label, original) => {
    expect(parseQuery(serializeQuery(original), "fallback")).toEqual(original);
  });

  it("reads hand-written files without a header", () => {
    expect(parseQuery("SELECT 42;\n", "answer")).toEqual(
      query({ name: "answer", sql: "SELECT 42;" })
    );
  });

  it("tolerates CRLF line endings", () => {
    const parsed = parseQuery("-- name: Win\r\n\r\nSELECT 1\r\n", "x");
    expect(parsed.name).toBe("Win");
    expect(parsed.sql).toBe("SELECT 1");
  });
});

describe("notebooks", () => {
  const notebook: BundleNotebook = {
    title: "Weekly review",
    cells: [
      { type: "markdown", content: "## Intro\n\nSome *notes*.\n" },
      { type: "sql", content: "SELECT 1;" },
      { type: "sql", content: "", collapsed: true },
      { type: "markdown", content: "" },
      { type: "markdown", content: "```sql\nSELECT 'inside markdown'\n```" },
      { type: "sql", content: "SELECT '```' AS fence\n" },
      { type: "python", content: 'df = sql("SELECT 1")\ndf' },
      { type: "python", content: "", collapsed: true },
      { type: "markdown", content: "last" },
    ],
  };

  it("renders SQL cells as fenced blocks", () => {
    const text = serializeNotebook({
      title: "T",
      cells: [{ type: "sql", content: "SELECT 1" }],
    });
    expect(text).toBe("# T\n\n<!-- cell:sql -->\n```sql\nSELECT 1\n```\n");
  });

  it("renders Python cells as fenced blocks", () => {
    const text = serializeNotebook({
      title: "T",
      cells: [{ type: "python", content: "print(1)" }],
    });
    expect(text).toBe("# T\n\n<!-- cell:python -->\n```python\nprint(1)\n```\n");
  });

  it("round-trips every cell exactly", () => {
    expect(parseNotebook(serializeNotebook(notebook), "fallback")).toEqual(notebook);
  });

  it("round-trips an empty notebook", () => {
    const empty = { title: "Empty", cells: [] };
    expect(parseNotebook(serializeNotebook(empty), "x")).toEqual(empty);
  });

  it("reads plain markdown with sql fences", () => {
    const parsed = parseNotebook(
      "# Hand written\n\nIntro text.\n\n```sql\nSELECT 1\n```\n\nMore.\n\n```SQL\nSELECT 2\n```\n",
      "x"
    );
    expect(parsed).toEqual({
      title: "Hand written",
      cells: [
        { type: "markdown", content: "Intro text." },
        { type: "sql", content: "SELECT 1" },
        { type: "markdown", content: "More." },
        { type: "sql", content: "SELECT 2" },
      ],
    });
  });

  it("reads plain markdown with python fences", () => {
    const parsed = parseNotebook("```python\nx = 1\n```\n\n```py\nx\n```\n", "Loose");
    expect(parsed).toEqual({
      title: "Loose",
      cells: [
        { type: "python", content: "x = 1" },
        { type: "python", content: "x" },
      ],
    });
  });
});

describe("bundles", () => {
  const bundle: ProjectBundle = {
    queries: [
      query({ id: "q1" }),
      // Same name: must not collide on disk.
      query({ id: "q2", sql: "SELECT 2" }),
    ],
    notebooks: [
      {
        id: "n1",
        title: "Review",
        cells: [
          { type: "markdown", content: "Hi" },
          { type: "sql", content: "SELECT 1" },
        ],
      },
    ],
    dashboards: [
      {
        id: "d1",
        name: "Sales",
        description: "Numbers",
        source: "# Sales\n\n```sql totals\nSELECT 1\n```\n\n<DataTable data={totals}/>\n",
        execution: { mode: "local", connectionId: "WASM" },
      },
    ],
  };

  it("lays files out by kind with a manifest", () => {
    const files = buildBundleFiles(bundle, { exportedAt: "2026-01-01T00:00:00.000Z" });
    expect(Object.keys(files).sort()).toEqual([
      "dashboards/sales.md",
      MANIFEST_PATH,
      "notebooks/review.md",
      "queries/top-customers-2.sql",
      "queries/top-customers.sql",
    ]);
    const manifest = JSON.parse(files[MANIFEST_PATH]);
    expect(manifest.format).toBe("duck-ui-project");
    expect(manifest.version).toBe(1);
    expect(manifest.queries).toEqual([
      { id: "q1", path: "queries/top-customers.sql" },
      { id: "q2", path: "queries/top-customers-2.sql" },
    ]);
  });

  it("round-trips through files", () => {
    const parsed = parseBundleFiles(buildBundleFiles(bundle));
    const byId = <T extends { id?: string }>(items: T[]) =>
      [...items].sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
    expect(byId(parsed.queries)).toEqual(byId(bundle.queries));
    expect(parsed.notebooks).toEqual(bundle.notebooks);
    expect(parsed.dashboards).toEqual(bundle.dashboards);
  });

  it("round-trips through a zip", async () => {
    const files = buildBundleFiles(bundle);
    expect(await unzipBundle(await zipBundle(files))).toEqual(files);
  });

  it("imports a zipped repository folder and ignores unrelated files", async () => {
    const zipped = await zipBundle({
      "my-repo/queries/answer.sql": "SELECT 42\n",
      "my-repo/dashboards/kpis.md": "# KPIs\n\nhello\n",
      "my-repo/README.md": "not part of the project",
      "__MACOSX/my-repo/queries/._answer.sql": "junk",
    });
    const parsed = parseBundleFiles(await unzipBundle(zipped));
    expect(parsed.queries).toEqual([query({ name: "answer", sql: "SELECT 42" })]);
    expect(parsed.dashboards).toEqual([{ name: "KPIs", source: "# KPIs\n\nhello" }]);
  });

  it("rejects a foreign or newer manifest", () => {
    expect(() => parseBundleFiles({ [MANIFEST_PATH]: "{}" })).toThrow(/not a Duck-UI/);
    expect(() =>
      parseBundleFiles({
        [MANIFEST_PATH]: JSON.stringify({ format: "duck-ui-project", version: 99 }),
      })
    ).toThrow(/newer version/);
  });

  it("never carries credentials", () => {
    const text = Object.values(buildBundleFiles(bundle)).join("\n");
    expect(text).not.toMatch(/password|apiKey|api_key|token|secret/i);
  });
});

describe("planImport", () => {
  it("matches by id, then by name, else creates", () => {
    const plan = planImport(
      {
        queries: [
          query({ id: "same-id", name: "Renamed" }),
          query({ id: "unknown", name: "Existing by name" }),
          query({ name: "Brand new" }),
        ],
        notebooks: [{ title: "Review", cells: [] }],
        dashboards: [{ id: "d9", name: "Other", source: "" }],
      },
      {
        queries: [
          { id: "same-id", name: "Old name" },
          { id: "q-name", name: "Existing by name" },
        ],
        notebooks: [{ id: "tab-1", name: "Review" }],
        dashboards: [{ id: "d1", name: "Sales" }],
      }
    );
    expect(plan.queries.map(({ action, targetId }) => ({ action, targetId }))).toEqual([
      { action: "overwrite", targetId: "same-id" },
      { action: "overwrite", targetId: "q-name" },
      { action: "create", targetId: undefined },
    ]);
    expect(plan.notebooks[0]).toMatchObject({ action: "overwrite", targetId: "tab-1" });
    expect(plan.dashboards[0]).toMatchObject({ action: "create" });
  });

  it("overwrites one existing record at most once", () => {
    const plan = planImport(
      { queries: [query(), query()], notebooks: [], dashboards: [] },
      { queries: [{ id: "a", name: "Top customers" }], notebooks: [], dashboards: [] }
    );
    expect(plan.queries.map((entry) => entry.action)).toEqual(["overwrite", "create"]);
  });
});
