import React, { useState } from "react";
import { useDuckStore } from "@/store";
import { generateUUID } from "@/lib/utils";
import { z } from "zod";
import { toast } from "sonner";
import { tableNameSchema } from "./helpers";
import type { ImportMode, UploadError } from "./types";

interface UseQueryImportArgs {
  importMode: ImportMode;
  setErrors: React.Dispatch<React.SetStateAction<UploadError[]>>;
  setIsSheetOpen: (open: boolean) => void;
}

/** State and handlers for the "From Query" tab. */
export function useQueryImport({ importMode, setErrors, setIsSheetOpen }: UseQueryImportArgs) {
  const executeQuery = useDuckStore((s) => s.executeQuery);

  // Query import state (Phase 2 - Query Import feature)
  const [queryInput, setQueryInput] = useState("");
  const [queryTableName, setQueryTableName] = useState("");
  const [isQueryImporting, setIsQueryImporting] = useState(false);

  // Handle Query Import
  const handleQueryImport = async () => {
    if (!queryInput.trim()) {
      toast.error("Please enter a SQL query");
      return;
    }

    if (!queryTableName.trim()) {
      toast.error("Please enter a table name");
      return;
    }

    try {
      tableNameSchema.parse(queryTableName);
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
      toast.error(errorMessage);
      return;
    }

    setIsQueryImporting(true);
    setErrors([]);

    try {
      const userQuery = queryInput.trim();
      const createType = importMode === "view" ? "VIEW" : "TABLE";
      const resultType = importMode === "view" ? "view" : "table";

      // Wrap user query in CREATE statement
      const wrappedQuery = `CREATE OR REPLACE ${createType} ${queryTableName} AS ${userQuery}`;

      await executeQuery(wrappedQuery);

      toast.success(`Successfully created ${resultType} '${queryTableName}' from query result`);
      setQueryInput("");
      setQueryTableName("");
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
      toast.error(`Failed to execute query: ${errorMessage}`);
    } finally {
      setIsQueryImporting(false);
    }
  };

  return {
    queryInput,
    setQueryInput,
    queryTableName,
    setQueryTableName,
    isQueryImporting,
    handleQueryImport,
  };
}
