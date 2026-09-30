import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The importer collects quote, escape, skip rows, sample size, NULL string
 * and the date formats, and `importFile` used to drop all of them.
 */

const { query, db } = vi.hoisted(() => ({
  query: vi.fn(),
  db: { dropFile: vi.fn(), registerFileBuffer: vi.fn() },
}));

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/engine", () => ({
  catalogToDatabaseInfo: vi.fn(),
  runQuery: vi.fn(),
  requireLocalDuckSession: vi.fn(() => ({ local: { db, connection: { query } } })),
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

const createStatement = (): string =>
  String(query.mock.calls.find(([sql]) => /CREATE OR REPLACE/.test(String(sql)))?.[0]).replace(
    /\s+/g,
    " "
  );

describe("importFile CSV options", () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ toArray: () => [{ count: 1 }] });
  });

  it("passes the advanced options to read_csv", async () => {
    await setup().importFile("data.csv", new ArrayBuffer(0), "data", "csv", undefined, {
      importMode: "table",
      csv: {
        header: false,
        autoDetect: true,
        allVarchar: false,
        ignoreErrors: false,
        nullPadding: true,
        delimiter: "|",
        quote: "'",
        escape: "\\",
        skip: 3,
        sampleSize: 100,
        nullStr: "NULL",
        dateFormat: "%d.%m.%Y",
        timestampFormat: "%d.%m.%Y %H:%M:%S",
      },
    });

    const sql = createStatement();
    expect(sql).toContain(`CREATE OR REPLACE TABLE "data" AS SELECT * FROM read_csv('data.csv', `);
    expect(sql).toContain("header=false");
    expect(sql).toContain("ignore_errors=false");
    expect(sql).toContain("delim='|'");
    expect(sql).toContain("quote=''''");
    expect(sql).toContain("escape='\\'");
    expect(sql).toContain("skip=3");
    expect(sql).toContain("sample_size=100");
    expect(sql).toContain("nullstr='NULL'");
    expect(sql).toContain("dateformat='%d.%m.%Y'");
    expect(sql).toContain("timestampformat='%d.%m.%Y %H:%M:%S'");
  });

  it("keeps the defaults when no options are given", async () => {
    await setup().importFile("data.csv", new ArrayBuffer(0), "data", "csv");
    expect(createStatement()).toContain(
      "read_csv('data.csv', header=true, auto_detect=true, all_varchar=false, ignore_errors=true, null_padding=true, delim=',')"
    );
  });
});
