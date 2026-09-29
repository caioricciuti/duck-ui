import type React from "react";

// Define a generic type for the data row
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataRow = Record<string, any>;

// Types for cell selection
export type CellPosition = { row: number; col: string };
export type ContextMenuPosition = { x: number; y: number };

// Type for the component props
export interface DuckTableProps {
  data: DataRow[];
  executionTime?: number | null;
  responseSize?: number | null;
  initialPageSize?: number;
  columnRenderers?: Record<string, (value: unknown) => React.ReactNode>;
  tableHeight?: string | number;
}

/** The cell shown in the value viewer dialog. */
export type ViewedCell = {
  value: unknown;
  columnName: string;
  rowIndex: number;
};
