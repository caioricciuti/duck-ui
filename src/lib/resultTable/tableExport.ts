import { toast } from "svelte-sonner";
import { useDuckStore } from "@/store";
import { fileSystemService } from "@/lib/fileSystem";
import {
  buildCsvContent,
  buildSqlValuesClause,
  buildXlsxBuffer,
  stringifyRowsAsJson,
  toXlsxRows,
  triggerDownload,
} from "./exportHelpers";
import type { DataRow, ExportTableView } from "./types";

/**
 * Download and save-to-folder actions for the table's current (filtered,
 * unpaginated) rows. Plain functions, recreated on every render like the
 * inline handlers they replace.
 */
export const createTableExporters = (data: DataRow[], table: ExportTableView) => {
  const exportToCSV = () => {
    if (!data || !data.length) return;
    const visibleKeys = table.getVisibleColumnIds();
    const headers = visibleKeys.length > 0 ? visibleKeys : data[0] ? Object.keys(data[0]) : [];
    if (headers.length === 0) return;

    // Export based on current filter, but original data (not paginated)
    const dataToExport = table.getFilteredRows();

    const blob = new Blob([buildCsvContent(headers, dataToExport)], {
      type: "text/csv;charset=utf-8;",
    });
    triggerDownload(blob, `duck-ui-export-${new Date().toISOString().slice(0, 19)}.csv`);
    toast.success("Exported to CSV");
  };

  const exportToJSON = () => {
    if (!data || !data.length) return;

    const dataToExport = table.getFilteredRows();

    const jsonString = stringifyRowsAsJson(dataToExport);

    const blob = new Blob([jsonString], { type: "application/json" });
    triggerDownload(blob, `duck-ui-export-${new Date().toISOString().slice(0, 19)}.json`);

    toast.success("Exported to JSON");
  };

  const exportToXLSX = async () => {
    if (!data || !data.length) return;

    try {
      // Dynamic import - only load ExcelJS when needed
      const ExcelJS = await import("exceljs");

      const dataToExport = toXlsxRows(table.getFilteredRows());

      const buffer = await buildXlsxBuffer(ExcelJS, dataToExport);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      triggerDownload(blob, `duck-ui-export-${new Date().toISOString().slice(0, 19)}.xlsx`);

      toast.success("Exported to Excel");
    } catch (error) {
      console.error("XLSX export failed:", error);
      toast.error("Failed to export to Excel");
    }
  };

  const exportToDuckDB = async () => {
    if (!data || !data.length) return;

    try {
      toast.info("Preparing DuckDB export...");

      const dataToExport = table.getFilteredRows();

      // Get current connection from store
      const { connection, db } = useDuckStore.getState();
      if (!connection || !db) {
        throw new Error("Database not initialized");
      }

      // Use Parquet format (DuckDB native format)
      const fileName = `export_${new Date().toISOString().slice(0, 19)}.parquet`;

      // Create VALUES clause for the data
      const valuesClause = buildSqlValuesClause(dataToExport);
      const keys = Object.keys(dataToExport[0]);

      await connection.query(
        `COPY (SELECT * FROM (VALUES ${valuesClause}) AS t(${keys.map((k) => `"${k}"`).join(", ")})) TO '${fileName}' (FORMAT 'parquet')`
      );

      const buffer = await db.copyFileToBuffer(fileName);
      await db.dropFile(fileName);

      // Convert Uint8Array to ArrayBuffer for Blob compatibility
      const arrayBuffer = buffer.buffer.slice(0) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
      triggerDownload(blob, fileName);

      toast.success("Exported to Parquet (DuckDB format)");
    } catch (error) {
      console.error("DuckDB export failed:", error);
      toast.error(
        "Failed to export: " + (error instanceof Error ? error.message : "Unknown error")
      );
    }
  };

  // Save to folder functions
  const saveToFolderAsCSV = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const visibleKeys = table.getVisibleColumnIds();
      const headers = visibleKeys.length > 0 ? visibleKeys : data[0] ? Object.keys(data[0]) : [];
      if (headers.length === 0) return;

      const dataToExport = table.getFilteredRows();

      const content = buildCsvContent(headers, dataToExport);
      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;

      await fileSystemService.saveFile(folderId, fileName, content);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const saveToFolderAsJSON = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const dataToExport = table.getFilteredRows();
      const jsonString = stringifyRowsAsJson(dataToExport);

      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
      await fileSystemService.saveFile(folderId, fileName, jsonString);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const saveToFolderAsXLSX = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const ExcelJS = await import("exceljs");
      const dataToExport = toXlsxRows(table.getFilteredRows());

      const xlsxBuffer = await buildXlsxBuffer(ExcelJS, dataToExport);
      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.xlsx`;

      await fileSystemService.saveFile(folderId, fileName, xlsxBuffer);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const saveToFolderAsParquet = async (folderId: string, folderName: string) => {
    if (!data || !data.length) return;

    try {
      const dataToExport = table.getFilteredRows();
      const { connection, db } = useDuckStore.getState();

      if (!connection || !db) {
        throw new Error("Database not initialized");
      }

      const tempFileName = `temp_export_${Date.now()}.parquet`;

      const valuesClause = buildSqlValuesClause(dataToExport);
      const keys = Object.keys(dataToExport[0]);

      await connection.query(
        `COPY (SELECT * FROM (VALUES ${valuesClause}) AS t(${keys.map((k) => `"${k}"`).join(", ")})) TO '${tempFileName}' (FORMAT 'parquet')`
      );

      const buffer = await db.copyFileToBuffer(tempFileName);
      await db.dropFile(tempFileName);

      const fileName = `export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.parquet`;
      // Create new ArrayBuffer copy to satisfy TypeScript
      const arrayBuffer = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(arrayBuffer).set(buffer);
      await fileSystemService.saveFile(folderId, fileName, arrayBuffer);
      toast.success(`Saved to ${folderName}/${fileName}`);
    } catch (error) {
      console.error("Save to folder failed:", error);
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  return {
    exportToCSV,
    exportToJSON,
    exportToXLSX,
    exportToDuckDB,
    saveToFolderAsCSV,
    saveToFolderAsJSON,
    saveToFolderAsXLSX,
    saveToFolderAsParquet,
  };
};

export type TableExporters = ReturnType<typeof createTableExporters>;
