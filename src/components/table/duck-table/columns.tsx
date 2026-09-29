import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { formatTimestampUTC } from "@/lib/datetime";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "./constants";
import type { DataRow, DuckTableProps } from "./types";
import { globalFilterFn, safeStringify } from "./utils";

interface BuildColumnsArgs {
  data: DataRow[];
  enabledColumns: Record<string, boolean>;
  columnRenderers: DuckTableProps["columnRenderers"];
  showRowNumbers: boolean;
}

/**
 * Column definitions (row-number column, sortable headers, cell renderers)
 * for the given data. Pure; DuckUITable memoizes the result.
 */
export const buildColumns = ({
  data,
  enabledColumns,
  columnRenderers,
  showRowNumbers,
}: BuildColumnsArgs): ColumnDef<DataRow>[] => {
  if (!data || !data.length || !data[0]) return [];
  const keys = Object.keys(data[0]);
  const cols: ColumnDef<DataRow>[] = [];

  // Add row numbers column if enabled
  if (showRowNumbers) {
    cols.push({
      id: "__row_number__",
      accessorFn: (_, index) => index + 1,
      minSize: 50,
      maxSize: 70,
      size: 60,
      header: () => (
        <div
          className="h-7 text-xs w-full flex items-center justify-center text-muted-foreground font-medium bg-muted cursor-pointer hover:brightness-95"
          title="Click to select all"
        >
          #
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-xs text-center text-muted-foreground font-mono bg-muted cursor-pointer hover:brightness-95">
          {row.index + 1}
        </div>
      ),
      enableColumnFilter: false,
      enableSorting: false,
      enableResizing: false,
    });
  }

  const dataCols = keys
    .map((key): ColumnDef<DataRow> => {
      return {
        id: key, // Explicit id to avoid TanStack Table misinterpreting numeric keys
        accessorFn: (row) => row[key], // Use accessorFn instead of accessorKey for direct property access
        minSize: MIN_COLUMN_WIDTH,
        maxSize: MAX_COLUMN_WIDTH,
        enableSorting: true,
        header: ({ column }) => (
          <div
            className="h-7 text-xs w-full flex items-center justify-between pl-0 pr-1 cursor-pointer select-none hover:bg-muted/50"
            title={`${key} (click to sort)`}
            onClick={() => column.toggleSorting()}
          >
            <span className="truncate">{key}</span>
            <span className="ml-1 flex-shrink-0">
              {column.getIsSorted() === "asc" ? (
                <ChevronUp className="h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronsUpDown className="h-3 w-3 opacity-30" />
              )}
            </span>
          </div>
        ),
        cell: ({ row }) => {
          const value = row.getValue(key);
          const titleAttribute = safeStringify(value);
          let displayValue: React.ReactNode;

          if (columnRenderers && columnRenderers[key] && value !== null && value !== undefined) {
            displayValue = columnRenderers[key](value);
          } else if (value === null || value === undefined) {
            displayValue = <span className="text-neutral-400 italic text-xs opacity-50">null</span>;
          } else if (value instanceof Date) {
            // Timestamps render as UTC "YYYY-MM-DD HH:MM:SS" — what DuckDB stored
            displayValue = formatTimestampUTC(value);
          } else if (typeof value === "object" || typeof value === "bigint") {
            // Properly stringify objects and BigInt for display
            const stringifiedValue = safeStringify(value);
            displayValue = stringifiedValue; // Use plain string for better copy behavior
          } else {
            displayValue = String(value); // Default to string
          }

          return (
            <div
              className={`p-1 px-2 align-middle text-xs overflow-hidden whitespace-nowrap select-text ${
                typeof value === "object" && !(value instanceof Date)
                  ? "font-mono text-blue-500"
                  : ""
              }`}
              title={titleAttribute}
            >
              {displayValue}
            </div>
          );
        },
        enableColumnFilter: false,
        filterFn: globalFilterFn,
      };
    })
    .filter((column) => {
      // Check both accessorKey (old) and id (new) for enabled columns
      const accessorKey = (column as unknown as { accessorKey?: string }).accessorKey;
      const columnId = (column as unknown as { id?: string }).id;
      const keyToCheck = columnId || accessorKey;
      return keyToCheck === undefined || enabledColumns[keyToCheck] !== false;
    });

  return [...cols, ...dataCols];
};
