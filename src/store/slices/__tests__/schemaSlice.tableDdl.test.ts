import { describe, it, expect, vi, beforeEach } from "vitest";

const { runQuery } = vi.hoisted(() => ({ runQuery: vi.fn() }));

vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/services/engine", () => ({
  runQuery,
  requireLocalDuckSession: vi.fn(),
  catalogToDatabaseInfo: vi.fn(),
}));

import { createSchemaSlice } from "../schemaSlice";

const setup = () => {
  const get = () => ({ currentSession: { id: "s" } }) as never;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSchemaSlice((() => {}) as any, get as any, undefined as any);
};

const result = (data: Record<string, unknown>[]) => ({
  columns: ["sql"],
  columnTypes: ["VARCHAR"],
  data,
  rowCount: data.length,
});

describe("fetchTableDdl", () => {
  beforeEach(() => runQuery.mockReset());

  it("asks the table and the view catalog, since the explorer lists both", async () => {
    runQuery.mockResolvedValue(result([{ sql: "CREATE TABLE orders(id INTEGER);" }]));

    const ddl = await setup().fetchTableDdl("shop", "orders", "staging");

    expect(ddl).toBe("CREATE TABLE orders(id INTEGER);");
    const [, sql] = runQuery.mock.calls[0];
    expect(sql).toContain("duckdb_tables()");
    expect(sql).toContain("duckdb_views()");
    expect(sql).toContain("schema_name = 'staging'");
    expect(sql).toMatch(/^SELECT /);
  });

  it("escapes names, which come from files the user attached", async () => {
    runQuery.mockResolvedValue(result([]));

    await setup().fetchTableDdl("my'db", "o'rders");

    const [, sql] = runQuery.mock.calls[0];
    expect(sql).toContain("database_name = 'my''db'");
    expect(sql).toContain("table_name = 'o''rders'");
    expect(sql).toContain("view_name = 'o''rders'");
    expect(sql).toContain("schema_name = 'main'");
  });

  it("returns null when the connection has no answer", async () => {
    runQuery.mockResolvedValueOnce(result([]));
    expect(await setup().fetchTableDdl("shop", "orders")).toBeNull();

    runQuery.mockResolvedValueOnce({ ...result([]), error: "Catalog Error" });
    expect(await setup().fetchTableDdl("shop", "orders")).toBeNull();

    runQuery.mockRejectedValueOnce(new Error("network"));
    expect(await setup().fetchTableDdl("shop", "orders")).toBeNull();
  });
});
