import { describe, it, expect, vi, beforeEach } from "vitest";
import { tableFromArrays, tableFromIPC, tableToIPC } from "apache-arrow";

/**
 * DuckDB WASM has no `read_arrow`, so an Arrow file went through
 * `SELECT * FROM read_arrow(...)` and failed with "Table Function with name
 * read_arrow does not exist". The engine's own IPC insert takes the bytes.
 */

const { query, insertArrowFromIPCStream, db } = vi.hoisted(() => ({
  query: vi.fn(),
  insertArrowFromIPCStream: vi.fn(),
  db: { dropFile: vi.fn(), registerFileBuffer: vi.fn() },
}));

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/engine", () => ({
  catalogToDatabaseInfo: vi.fn(),
  runQuery: vi.fn(),
  requireLocalDuckSession: vi.fn(() => ({
    local: { db, connection: { query, insertArrowFromIPCStream } },
  })),
}));

import { createSchemaSlice } from "../schemaSlice";

const setup = () => {
  const state = {
    currentSession: { capabilities: { supportsFileImport: true } },
    fetchDatabasesAndTablesInfo: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSchemaSlice(vi.fn() as any, (() => state) as any, undefined as any);
};

const people = tableFromArrays({ id: Int32Array.from([1, 2, 3]), name: ["ann", "bob", "cid"] });

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe("importFile Arrow", () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ toArray: () => [{ count: 1 }] });
    insertArrowFromIPCStream.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ["stream", "stream"],
    ["file", "file"],
  ] as const)("inserts a %s format IPC buffer as a table", async (_label, format) => {
    await setup().importFile(
      "people.arrow",
      toBuffer(tableToIPC(people, format)),
      "people",
      "arrow"
    );

    expect(query.mock.calls.map(([sql]) => String(sql))).toContain('DROP TABLE IF EXISTS "people"');
    expect(insertArrowFromIPCStream).toHaveBeenCalledTimes(1);
    const [ipc, options] = insertArrowFromIPCStream.mock.calls[0];
    expect(options).toEqual({ name: "people", create: true });
    const inserted = tableFromIPC(ipc as Uint8Array);
    expect(inserted.numRows).toBe(3);
    expect(inserted.schema.fields.map((f) => f.name)).toEqual(["id", "name"]);
    // Nothing is read as a file, so no read_* statement runs.
    expect(query.mock.calls.some(([sql]) => /read_arrow/.test(String(sql)))).toBe(false);
  });

  it("makes a table in view mode too, since a view has nothing to point at", async () => {
    await setup().importFile(
      "people.arrow",
      toBuffer(tableToIPC(people, "stream")),
      "people",
      "arrow",
      undefined,
      { importMode: "view" }
    );
    expect(insertArrowFromIPCStream).toHaveBeenCalledWith(expect.any(Uint8Array), {
      name: "people",
      create: true,
    });
  });
});
