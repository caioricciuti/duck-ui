import React, { useState } from "react";
import { useDuckStore, type QueryResult } from "@/store";
import { stageRemoteTextFile } from "@/services/duckdb";
import { generateUUID } from "@/lib/utils";
import { z } from "zod";
import { toast } from "sonner";
import { PREVIEW_ROW_LIMIT } from "./constants";
import { tableNameSchema } from "./helpers";
import type { ImportMode, SchemaColumn, UploadError } from "./types";

interface UseUrlImportArgs {
  importMode: ImportMode;
  setErrors: React.Dispatch<React.SetStateAction<UploadError[]>>;
  setIsSheetOpen: (open: boolean) => void;
}

/** State and handlers for the URL import tab and its preview/schema editor. */
export function useUrlImport({ importMode, setErrors, setIsSheetOpen }: UseUrlImportArgs) {
  const db = useDuckStore((s) => s.db);
  const supportsFileImport = useDuckStore(
    (s) => s.currentSession?.capabilities.supportsFileImport ?? false
  );
  const executeQuery = useDuckStore((s) => s.executeQuery);

  // URL import state
  const [urlInput, setUrlInput] = useState("");
  const [urlTableName, setUrlTableName] = useState("");
  const [isUrlImporting, setIsUrlImporting] = useState(false);

  // Preview state (Phase 2 - used in PreviewTable component)
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<QueryResult | null>(null);
  const [previewSource, setPreviewSource] = useState<"file" | "url" | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewTableName, setPreviewTableName] = useState<string>("");

  // Schema customization state (Phase 2 - used in SchemaEditor component)
  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([]);
  const [isSchemaCustomizing, setIsSchemaCustomizing] = useState(false);

  /**
   * Downloads text formats in JS and registers them in the virtual filesystem,
   * returning the name to read from. duckdb-wasm's CSV/JSON sniffer reads
   * remote files through range requests and mis-detects the dialect, which
   * silently collapses every row into one column. Parquet is unaffected and
   * streams as usual, and external servers fetch the URL themselves.
   */
  const resolveUrlSource = async (url: string, extension?: string): Promise<string> => {
    if (extension !== "csv" && extension !== "json") return url;
    if (!db || !supportsFileImport) return url;
    try {
      return (await stageRemoteTextFile(db, url)) ?? url;
    } catch (error) {
      console.error("Failed to stage remote file, falling back to httpfs:", error);
      return url;
    }
  };

  // Preview handlers - Phase 2
  const handlePreviewUrl = async (url: string, tableName: string) => {
    setIsPreviewing(true);
    setErrors([]);

    try {
      const urlPath = url.split("?")[0];
      const extension = urlPath.split(".").pop()?.toLowerCase();

      const source = await resolveUrlSource(url, extension);

      let previewQuery = "";
      if (extension === "csv") {
        previewQuery = `SELECT * FROM read_csv('${source}', auto_detect=true, header=true) LIMIT ${PREVIEW_ROW_LIMIT}`;
      } else if (extension === "json") {
        previewQuery = `SELECT * FROM read_json('${source}', auto_detect=true) LIMIT ${PREVIEW_ROW_LIMIT}`;
      } else if (extension === "parquet") {
        previewQuery = `SELECT * FROM read_parquet('${source}') LIMIT ${PREVIEW_ROW_LIMIT}`;
      } else {
        throw new Error(`Unsupported file type for preview: .${extension}`);
      }

      const result = await executeQuery(previewQuery);
      if (result && !result.error) {
        setPreviewData(result);
        setPreviewSource("url");
        setPreviewFileName(url);
        setPreviewTableName(tableName);
        setIsPreviewMode(true);

        // Initialize schema columns from preview
        const initialSchema: SchemaColumn[] = result.columns.map((col, idx) => ({
          originalName: col,
          newName: col,
          type: result.columnTypes[idx] || "VARCHAR",
          included: true,
        }));
        setSchemaColumns(initialSchema);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Preview failed: ${errorMessage}`);
      setErrors([
        {
          id: generateUUID(),
          message: errorMessage,
          severity: "error",
        },
      ]);
    } finally {
      setIsPreviewing(false);
    }
  };

  // Wrapper for preview with validation
  const handlePreview = async () => {
    if (!urlInput.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    if (!urlTableName.trim()) {
      toast.error("Please enter a table name");
      return;
    }

    try {
      tableNameSchema.parse(urlTableName);
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
      toast.error(errorMessage);
      return;
    }

    await handlePreviewUrl(urlInput, urlTableName);
  };

  // Exit preview mode
  const handleBackFromPreview = () => {
    setIsPreviewMode(false);
    setPreviewData(null);
    setPreviewSource(null);
    setPreviewFileName("");
    setPreviewTableName("");
    setSchemaColumns([]);
  };

  // Import from preview (with optional schema customization)
  const handleImportFromPreview = async () => {
    if (!previewFileName || !previewTableName) return;

    setIsUrlImporting(true);
    setErrors([]);

    try {
      if (previewSource === "url") {
        const url = previewFileName;
        const urlPath = url.split("?")[0];
        const extension = urlPath.split(".").pop()?.toLowerCase();

        // Build column selection and casting based on schema customization
        const includedColumns = schemaColumns.filter((col) => col.included);
        const hasSchemaChanges = schemaColumns.some(
          (col) => col.newName !== col.originalName || !col.included
        );

        let columnSelection = "*";
        if (hasSchemaChanges && includedColumns.length > 0) {
          columnSelection = includedColumns
            .map((col) => {
              if (col.newName !== col.originalName) {
                return `"${col.originalName}" AS "${col.newName}"`;
              }
              return `"${col.originalName}"`;
            })
            .join(", ");
        }

        let query = "";
        const createType = importMode === "view" ? "VIEW" : "TABLE";
        const resultType = importMode === "view" ? "view" : "table";

        if (extension === "csv") {
          query = `CREATE OR REPLACE ${createType} ${previewTableName} AS SELECT ${columnSelection} FROM read_csv('${url}', auto_detect=true, ignore_errors=true, header=true)`;
        } else if (extension === "json") {
          query = `CREATE OR REPLACE ${createType} ${previewTableName} AS SELECT ${columnSelection} FROM read_json('${url}', auto_detect=true, ignore_errors=true)`;
        } else if (extension === "parquet") {
          query = `CREATE OR REPLACE ${createType} ${previewTableName} AS SELECT ${columnSelection} FROM read_parquet('${url}')`;
        } else {
          throw new Error(`Unsupported file type: .${extension}`);
        }

        await executeQuery(query);
        toast.success(`Successfully created ${resultType} '${previewTableName}'`);

        // Reset state and close sheet
        handleBackFromPreview();
        setIsSheetOpen(false);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setErrors([
        {
          id: generateUUID(),
          message: errorMessage,
          severity: "error",
        },
      ]);
      toast.error(`Failed to import: ${errorMessage}`);
    } finally {
      setIsUrlImporting(false);
    }
  };

  // Schema customization handlers
  const handleToggleColumn = (originalName: string) => {
    setSchemaColumns((prev) =>
      prev.map((col) =>
        col.originalName === originalName ? { ...col, included: !col.included } : col
      )
    );
  };

  const handleRenameColumn = (originalName: string, newName: string) => {
    setSchemaColumns((prev) =>
      prev.map((col) => (col.originalName === originalName ? { ...col, newName } : col))
    );
  };

  const handleChangeColumnType = (originalName: string, type: string) => {
    setSchemaColumns((prev) =>
      prev.map((col) => (col.originalName === originalName ? { ...col, type } : col))
    );
  };

  // Handle URL import
  const handleUrlImport = async () => {
    if (!urlInput.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    if (!urlTableName.trim()) {
      toast.error("Please enter a table name");
      return;
    }

    try {
      tableNameSchema.parse(urlTableName);
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
      toast.error(errorMessage);
      return;
    }

    setIsUrlImporting(true);
    setErrors([]);

    try {
      // Detect file type from URL
      const url = urlInput.trim();
      const urlPath = url.split("?")[0]; // Remove query params
      const extension = urlPath.split(".").pop()?.toLowerCase();

      let query = "";

      // Build import query based on file type and import mode
      const createType = importMode === "view" ? "VIEW" : "TABLE";
      const resultType = importMode === "view" ? "view" : "table";

      const source = await resolveUrlSource(url, extension);

      if (extension === "csv") {
        query = `CREATE OR REPLACE ${createType} ${urlTableName} AS SELECT * FROM read_csv('${source}', auto_detect=true, ignore_errors=true, header=true)`;
      } else if (extension === "json") {
        query = `CREATE OR REPLACE ${createType} ${urlTableName} AS SELECT * FROM read_json('${source}', auto_detect=true, ignore_errors=true)`;
      } else if (extension === "parquet") {
        query = `CREATE OR REPLACE ${createType} ${urlTableName} AS SELECT * FROM read_parquet('${source}')`;
      } else {
        throw new Error(`Unsupported file type: .${extension}. Supported: CSV, JSON, Parquet`);
      }

      await executeQuery(query);

      toast.success(`Successfully created ${resultType} '${urlTableName}' from URL`);
      setUrlInput("");
      setUrlTableName("");
      setIsSheetOpen(false);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setErrors([
        {
          id: generateUUID(),
          message: errorMessage,
          severity: "error",
        },
      ]);
      toast.error(`Failed to import from URL: ${errorMessage}`);
    } finally {
      setIsUrlImporting(false);
    }
  };

  return {
    urlInput,
    setUrlInput,
    urlTableName,
    setUrlTableName,
    isUrlImporting,
    isPreviewMode,
    isPreviewing,
    previewData,
    previewFileName,
    previewTableName,
    schemaColumns,
    isSchemaCustomizing,
    setIsSchemaCustomizing,
    handlePreview,
    handleBackFromPreview,
    handleImportFromPreview,
    handleToggleColumn,
    handleRenameColumn,
    handleChangeColumnType,
    handleUrlImport,
  };
}
