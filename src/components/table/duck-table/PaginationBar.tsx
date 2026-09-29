import React from "react";
import type { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ALL_ROWS } from "./constants";
import type { DataRow } from "./types";

interface PaginationBarProps {
  table: Table<DataRow>;
}

/** First/prev/next/last buttons and the rows-per-page select. */
const PaginationBar: React.FC<PaginationBarProps> = ({ table }) => {
  return (
    <div className="flex items-center justify-between mt-2 flex-shrink-0 mb-1 px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          className="h-7 w-7 p-0 text-xs"
          title="First page"
          aria-label="First page"
        >
          ««
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="h-7 w-7 p-0 text-xs"
          title="Previous page"
          aria-label="Previous page"
        >
          «
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="h-7 w-7 p-0 text-xs"
          title="Next page"
          aria-label="Next page"
        >
          »
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
          className="h-7 w-7 p-0 text-xs"
          title="Last page"
          aria-label="Last page"
        >
          »»
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {table.getState().pagination.pageSize === ALL_ROWS
            ? "All rows"
            : `Page ${table.getState().pagination.pageIndex + 1} of ${table.getPageCount() || 1}`}
        </span>
        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => {
            table.setPageSize(Number(e.target.value));
          }}
          className="text-xs border border-border/40 rounded-md h-7 px-2 bg-background"
          title="Rows per page"
        >
          <option value={ALL_ROWS}>All (scroll)</option>
          {[10, 25, 50, 100, 200, 500, 1000, 5000, 10000].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize} rows
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default PaginationBar;
