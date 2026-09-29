import { formatTimestampUTC } from "@/lib/datetime";
import type { DataRow } from "./types";
import { safeStringify } from "./utils";

/** CSV text (header line + one line per row) for the given columns. */
export const buildCsvContent = (headers: string[], dataToExport: DataRow[]): string => {
  const csvRows = [headers.join(",")];

  for (const row of dataToExport) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "string" && value.includes(",")) return `"${value.replace(/"/g, '""')}"`;
      if (typeof value === "object" || typeof value === "bigint")
        return `"${safeStringify(value).replace(/"/g, '""')}"`;
      return String(value);
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
};

/** Pretty-printed JSON with BigInt values written as strings. */
export const stringifyRowsAsJson = (dataToExport: DataRow[]): string =>
  JSON.stringify(dataToExport, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);

/** SQL `VALUES` tuples for the rows, keyed by the first row's columns. */
export const buildSqlValuesClause = (dataToExport: DataRow[]): string => {
  if (dataToExport.length === 0) return "";

  const keys = Object.keys(dataToExport[0]);
  const values = dataToExport.map((row) => {
    const rowValues = keys.map((key) => {
      const val = row[key];
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
      if (typeof val === "bigint") return val.toString();
      if (val instanceof Date) return `TIMESTAMP '${formatTimestampUTC(val)}'`;
      if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
      return String(val);
    });
    return `(${rowValues.join(", ")})`;
  });

  return values.join(", ");
};

/** Copies of the rows with BigInt values converted to strings (ExcelJS can't write them). */
export const toXlsxRows = (originals: DataRow[]): Record<string, unknown>[] =>
  originals.map((original) => {
    const row: Record<string, unknown> = {};
    Object.keys(original).forEach((key) => {
      const val = original[key];
      row[key] = typeof val === "bigint" ? val.toString() : val;
    });
    return row;
  });

/** Builds a one-sheet workbook ("Data") and returns its XLSX bytes. */
export const buildXlsxBuffer = async (
  ExcelJS: typeof import("exceljs"),
  dataToExport: Record<string, unknown>[]
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Data");

  const keys = Object.keys(dataToExport[0] || {});
  const maxWidth = 50;
  worksheet.columns = keys.map((key) => ({
    header: key,
    key,
    width: Math.min(
      maxWidth,
      Math.max(
        key.length,
        ...dataToExport.slice(0, 100).map((row) => String(row[key] || "").length)
      )
    ),
  }));

  worksheet.addRows(dataToExport);

  return workbook.xlsx.writeBuffer();
};

/** Starts a browser download of the blob under the given file name. */
export const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
