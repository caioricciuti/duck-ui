// Define a generic type for the data row
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataRow = Record<string, any>;

// Types for cell selection
export type CellPosition = { row: number; col: string };
export type ContextMenuPosition = { x: number; y: number };

/** The cell shown in the value viewer dialog. */
export type ViewedCell = {
  value: unknown;
  columnName: string;
  rowIndex: number;
};

/** A row as the filter sees it: only cell lookup by column id. */
export interface FilterRow {
  getValue: (columnId: string) => unknown;
}

/** What the exporters need from the grid: visible columns and filtered rows. */
export interface ExportTableView {
  getVisibleColumnIds: () => string[];
  getFilteredRows: () => DataRow[];
}
