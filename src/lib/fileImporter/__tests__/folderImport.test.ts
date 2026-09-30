import { describe, it, expect, vi } from "vitest";

vi.mock("svelte-sonner", () => ({ toast: {} }));
vi.mock("@/store", () => ({ useDuckStore: { getState: vi.fn() } }));

import { folderImportType } from "../folderImport";
import { buildCsvReadOptions } from "../importSql";
import { SUPPORTED_EXTENSIONS } from "@/lib/fileSystem";

/**
 * The folder tree listed .tsv, .ipc and .xls, and importing them ran
 * read_tsv(), read_ipc() and read_xls(), none of which DuckDB has.
 */
describe("folderImportType", () => {
  it("reads TSV as CSV with a tab", () => {
    const { fileType, csv } = folderImportType(".tsv");
    expect(fileType).toBe("csv");
    expect(buildCsvReadOptions(csv)).toContain("delim='\t'");
  });

  it("reads Arrow IPC and line-delimited JSON with their shared readers", () => {
    expect(folderImportType(".ipc")).toEqual({ fileType: "arrow" });
    expect(folderImportType(".JSONL")).toEqual({ fileType: "json" });
    expect(folderImportType(".ndjson")).toEqual({ fileType: "json" });
  });

  it("passes the other extensions through", () => {
    expect(folderImportType(".parquet")).toEqual({ fileType: "parquet" });
    expect(folderImportType(".csv")).toEqual({ fileType: "csv" });
  });

  it("does not list legacy Excel files", () => {
    expect(SUPPORTED_EXTENSIONS).not.toContain(".xls");
    expect(SUPPORTED_EXTENSIONS).toContain(".xlsx");
  });
});
