import { useDuckStore, type QueryResult } from "@/store";
import { stageRemoteTextFile } from "@/services/duckdb";
import * as toast from "@/lib/stores/toast.svelte";
import { PREVIEW_ROW_LIMIT } from "./constants";
import {
  errorMessageOf,
  runImportQuery,
  tableNameError,
  toUploadError,
  type ImporterContext,
} from "./context";
import { buildColumnSelection, buildCreateAs, buildReadExpression } from "./importSql";
import type { SchemaColumn } from "./types";

const extensionOfUrl = (url: string): string | undefined =>
  url.split("?")[0].split(".").pop()?.toLowerCase();

/** State and handlers for the URL import tab and its preview/schema editor. */
export function createUrlImport(ctx: ImporterContext) {
  let urlInput = $state("");
  let urlTableName = $state("");
  let isUrlImporting = $state(false);

  let isPreviewMode = $state(false);
  let isPreviewing = $state(false);
  // Raw: result rows are read-only and can be large.
  let previewData = $state.raw<QueryResult | null>(null);
  let previewSource = $state<"file" | "url" | null>(null);
  let previewFileName = $state("");
  let previewTableName = $state("");

  let schemaColumns = $state<SchemaColumn[]>([]);
  let isSchemaCustomizing = $state(false);

  /**
   * Downloads text formats in JS and registers them in the virtual filesystem,
   * returning the name to read from. duckdb-wasm's CSV/JSON sniffer reads
   * remote files through range requests and mis-detects the dialect, which
   * silently collapses every row into one column. Parquet is unaffected and
   * streams as usual, and external servers fetch the URL themselves.
   */
  const resolveUrlSource = async (url: string, extension?: string): Promise<string> => {
    if (extension !== "csv" && extension !== "json") return url;
    const { db, currentSession } = useDuckStore.getState();
    const supportsFileImport = currentSession?.capabilities.supportsFileImport ?? false;
    if (!db || !supportsFileImport) return url;
    try {
      return (await stageRemoteTextFile(db, url)) ?? url;
    } catch (error) {
      console.error("Failed to stage remote file, falling back to httpfs:", error);
      return url;
    }
  };

  /** Shared checks for Preview and Import Directly. Toasts and returns false when invalid. */
  const validateInputs = (): boolean => {
    if (!urlInput.trim()) {
      toast.error("Please enter a URL");
      return false;
    }
    if (!urlTableName.trim()) {
      toast.error("Please enter a table name");
      return false;
    }
    const nameError = tableNameError(urlTableName);
    if (nameError) {
      toast.error(nameError);
      return false;
    }
    return true;
  };

  const handlePreviewUrl = async (url: string, tableName: string) => {
    isPreviewing = true;
    ctx.setErrors([]);

    try {
      const extension = extensionOfUrl(url);
      const source = await resolveUrlSource(url, extension);

      const read = buildReadExpression(source, extension);
      if (!read) throw new Error(`Unsupported file type for preview: .${extension}`);

      const result = await runImportQuery(`SELECT * FROM ${read} LIMIT ${PREVIEW_ROW_LIMIT}`);
      previewData = result;
      previewSource = "url";
      previewFileName = url;
      previewTableName = tableName;
      isPreviewMode = true;

      schemaColumns = result.columns.map((col, idx) => ({
        originalName: col,
        newName: col,
        type: result.columnTypes[idx] || "VARCHAR",
        originalType: result.columnTypes[idx] || "VARCHAR",
        included: true,
      }));
    } catch (e) {
      const errorMessage = errorMessageOf(e);
      toast.error(`Preview failed: ${errorMessage}`);
      ctx.setErrors([toUploadError(errorMessage)]);
    } finally {
      isPreviewing = false;
    }
  };

  const handlePreview = async () => {
    if (!validateInputs()) return;
    await handlePreviewUrl(urlInput, urlTableName);
  };

  const handleBackFromPreview = () => {
    isPreviewMode = false;
    previewData = null;
    previewSource = null;
    previewFileName = "";
    previewTableName = "";
    schemaColumns = [];
  };

  /** Import from preview, with the optional column selection and renames. */
  const handleImportFromPreview = async () => {
    if (!previewFileName || !previewTableName) return;

    isUrlImporting = true;
    ctx.setErrors([]);

    try {
      if (previewSource === "url") {
        const url = previewFileName;
        const extension = extensionOfUrl(url);

        const columnSelection = buildColumnSelection($state.snapshot(schemaColumns));

        const importMode = ctx.getImportMode();
        const createType = importMode === "view" ? "VIEW" : "TABLE";
        const resultType = importMode === "view" ? "view" : "table";

        // The same source the preview read. Reading the raw URL here could
        // sniff a different CSV dialect than the one the user just approved.
        const source = await resolveUrlSource(url, extension);
        const read = buildReadExpression(source, extension, { ignoreErrors: true });
        if (!read) throw new Error(`Unsupported file type: .${extension}`);
        const query = buildCreateAs(
          createType,
          previewTableName,
          `SELECT ${columnSelection} FROM ${read}`
        );

        await runImportQuery(query);
        toast.success(`Successfully created ${resultType} '${previewTableName}'`);

        handleBackFromPreview();
        ctx.close();
      }
    } catch (e) {
      const errorMessage = errorMessageOf(e);
      ctx.setErrors([toUploadError(errorMessage)]);
      toast.error(`Failed to import: ${errorMessage}`);
    } finally {
      isUrlImporting = false;
    }
  };

  const updateColumn = (originalName: string, patch: Partial<SchemaColumn>) => {
    schemaColumns = schemaColumns.map((col) =>
      col.originalName === originalName ? { ...col, ...patch } : col
    );
  };

  const handleToggleColumn = (originalName: string) => {
    const column = schemaColumns.find((col) => col.originalName === originalName);
    if (column) updateColumn(originalName, { included: !column.included });
  };

  const handleRenameColumn = (originalName: string, newName: string) => {
    updateColumn(originalName, { newName });
  };

  const handleChangeColumnType = (originalName: string, type: string) => {
    updateColumn(originalName, { type });
  };

  const handleUrlImport = async () => {
    if (!validateInputs()) return;

    isUrlImporting = true;
    ctx.setErrors([]);

    try {
      const url = urlInput.trim();
      const extension = extensionOfUrl(url);

      const importMode = ctx.getImportMode();
      const createType = importMode === "view" ? "VIEW" : "TABLE";
      const resultType = importMode === "view" ? "view" : "table";

      const source = await resolveUrlSource(url, extension);

      const read = buildReadExpression(source, extension, { ignoreErrors: true });
      if (!read) {
        throw new Error(`Unsupported file type: .${extension}. Supported: CSV, JSON, Parquet`);
      }

      await runImportQuery(buildCreateAs(createType, urlTableName, `SELECT * FROM ${read}`));

      toast.success(`Successfully created ${resultType} '${urlTableName}' from URL`);
      urlInput = "";
      urlTableName = "";
      ctx.close();
    } catch (e) {
      const errorMessage = errorMessageOf(e);
      ctx.setErrors([toUploadError(errorMessage)]);
      toast.error(`Failed to import from URL: ${errorMessage}`);
    } finally {
      isUrlImporting = false;
    }
  };

  return {
    get urlInput() {
      return urlInput;
    },
    set urlInput(value: string) {
      urlInput = value;
    },
    get urlTableName() {
      return urlTableName;
    },
    set urlTableName(value: string) {
      urlTableName = value;
    },
    get isUrlImporting() {
      return isUrlImporting;
    },
    get isPreviewMode() {
      return isPreviewMode;
    },
    get isPreviewing() {
      return isPreviewing;
    },
    get previewData() {
      return previewData;
    },
    get previewFileName() {
      return previewFileName;
    },
    get previewTableName() {
      return previewTableName;
    },
    get schemaColumns() {
      return schemaColumns;
    },
    get isSchemaCustomizing() {
      return isSchemaCustomizing;
    },
    set isSchemaCustomizing(value: boolean) {
      isSchemaCustomizing = value;
    },
    handlePreview,
    handleBackFromPreview,
    handleImportFromPreview,
    handleToggleColumn,
    handleRenameColumn,
    handleChangeColumnType,
    handleUrlImport,
  };
}

export type UrlImport = ReturnType<typeof createUrlImport>;
