import * as toast from "@/lib/stores/toast.svelte";
import {
  errorMessageOf,
  runImportQuery,
  tableNameError,
  toUploadError,
  type ImporterContext,
} from "./context";

/** State and handlers for the "From Query" tab. */
export function createQueryImport(ctx: ImporterContext) {
  let queryInput = $state("");
  let queryTableName = $state("");
  let isQueryImporting = $state(false);

  const handleQueryImport = async () => {
    if (!queryInput.trim()) {
      toast.error("Please enter a SQL query");
      return;
    }

    if (!queryTableName.trim()) {
      toast.error("Please enter a table name");
      return;
    }

    const nameError = tableNameError(queryTableName);
    if (nameError) {
      toast.error(nameError);
      return;
    }

    isQueryImporting = true;
    ctx.setErrors([]);

    try {
      const userQuery = queryInput.trim();
      const importMode = ctx.getImportMode();
      const createType = importMode === "view" ? "VIEW" : "TABLE";
      const resultType = importMode === "view" ? "view" : "table";

      await runImportQuery(`CREATE OR REPLACE ${createType} ${queryTableName} AS ${userQuery}`);

      toast.success(`Successfully created ${resultType} '${queryTableName}' from query result`);
      queryInput = "";
      queryTableName = "";
      ctx.close();
    } catch (e) {
      const errorMessage = errorMessageOf(e);
      ctx.setErrors([toUploadError(errorMessage)]);
      toast.error(`Failed to execute query: ${errorMessage}`);
    } finally {
      isQueryImporting = false;
    }
  };

  return {
    get queryInput() {
      return queryInput;
    },
    set queryInput(value: string) {
      queryInput = value;
    },
    get queryTableName() {
      return queryTableName;
    },
    set queryTableName(value: string) {
      queryTableName = value;
    },
    get isQueryImporting() {
      return isQueryImporting;
    },
    handleQueryImport,
  };
}

export type QueryImport = ReturnType<typeof createQueryImport>;
