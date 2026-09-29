import { z } from "zod";
import { useDuckStore, type QueryResult } from "@/store";
import { generateUUID } from "@/lib/utils";
import { tableNameSchema } from "./helpers";
import type { ImportMode, UploadError } from "./types";

/**
 * What the three import flows share with the importer shell: the selected
 * mode, the error list shown under the active tab, and a way to close.
 */
export interface ImporterContext {
  getImportMode: () => ImportMode;
  getErrors: () => UploadError[];
  setErrors: (errors: UploadError[]) => void;
  close: () => void;
}

/** Validation message for a table name, or null when the name is valid. */
export function tableNameError(name: string): string | null {
  try {
    tableNameSchema.parse(name);
    return null;
  } catch (error) {
    return error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
  }
}

export function toUploadError(message: string, file?: string): UploadError {
  return { id: generateUUID(), message, file, severity: "error" };
}

export function errorMessageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

/**
 * Runs an ad-hoc statement and throws when it fails.
 *
 * `executeQuery` resolves with a result carrying `error` instead of
 * rejecting, so awaiting it alone would report a failed import as a success.
 */
export async function runImportQuery(sql: string): Promise<QueryResult> {
  const result = await useDuckStore.getState().executeQuery(sql);
  if (!result) throw new Error("Query failed");
  if (result.error) throw new Error(result.error);
  return result;
}
