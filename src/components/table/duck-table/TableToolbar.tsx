import React from "react";
import type { Table } from "@tanstack/react-table";
import { Search, Clock, SlidersHorizontal, Grid3X3, BarChart3 } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColumnSelectorPanel from "./ColumnSelectorPanel";
import ExportMenu from "./ExportMenu";
import SpreadsheetOptionsPanel from "./SpreadsheetOptionsPanel";
import type { TableExporters } from "./tableExport";
import type { DataRow } from "./types";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

interface TableToolbarProps {
  data: DataRow[];
  table: Table<DataRow>;
  executionTime?: number | null;
  responseSize?: number | null;
  globalFilterInput: string;
  setGlobalFilterInput: Setter<string>;
  showStatsPanel: boolean;
  setShowStatsPanel: Setter<boolean>;
  setStatsPanelMinimized: Setter<boolean>;
  showColumnSelector: boolean;
  setShowColumnSelector: Setter<boolean>;
  enabledColumns: Record<string, boolean>;
  columnSelectorFilter: string;
  setColumnSelectorFilter: Setter<string>;
  toggleColumnVisibility: (columnId: string) => void;
  toggleAllColumns: (value: boolean) => void;
  showSpreadsheetOptions: boolean;
  setShowSpreadsheetOptions: Setter<boolean>;
  showRowNumbers: boolean;
  setShowRowNumbers: Setter<boolean>;
  zebraStripes: boolean;
  setZebraStripes: Setter<boolean>;
  showGridLines: boolean;
  setShowGridLines: Setter<boolean>;
  userResizedColumns: Record<string, number>;
  setUserResizedColumns: Setter<Record<string, number>>;
  selectedCells: Set<string>;
  setSelectedCells: Setter<Set<string>>;
  exporters: TableExporters;
}

/** Search, stats/columns/view toggles, export menu and selection indicator. */
const TableToolbar: React.FC<TableToolbarProps> = ({
  data,
  table,
  executionTime,
  responseSize,
  globalFilterInput,
  setGlobalFilterInput,
  showStatsPanel,
  setShowStatsPanel,
  setStatsPanelMinimized,
  showColumnSelector,
  setShowColumnSelector,
  enabledColumns,
  columnSelectorFilter,
  setColumnSelectorFilter,
  toggleColumnVisibility,
  toggleAllColumns,
  showSpreadsheetOptions,
  setShowSpreadsheetOptions,
  showRowNumbers,
  setShowRowNumbers,
  zebraStripes,
  setZebraStripes,
  showGridLines,
  setShowGridLines,
  userResizedColumns,
  setUserResizedColumns,
  selectedCells,
  setSelectedCells,
  exporters,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 flex-shrink-0 mt-2 px-2">
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search all columns..."
            value={globalFilterInput}
            onChange={(e) => setGlobalFilterInput(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setGlobalFilterInput("");
            table.resetColumnFilters(true);
          }}
          className="h-8 text-xs"
          disabled={!globalFilterInput && !table.getState().columnFilters.length}
        >
          Clear Filters
        </Button>
      </div>
      <div className="hidden md:flex items-center gap-x-4 text-xs text-muted-foreground px-2">
        {executionTime !== null && executionTime !== undefined && (
          <div className="flex items-center gap-1" title="Query execution time">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(executionTime)}</span>
          </div>
        )}
        {responseSize !== null && responseSize !== undefined && (
          <div className="flex items-center" title="Response size">
            <span>{formatBytes(responseSize)}</span>
          </div>
        )}
        <span title="Showing rows count">{data.length.toLocaleString()} rows</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowStatsPanel(!showStatsPanel);
            if (!showStatsPanel) setStatsPanelMinimized(false);
          }}
          className="h-8 text-xs"
          title="Show column statistics"
        >
          <BarChart3 className="h-3.5 w-3.5 mr-1" />
          Stats
        </Button>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumnSelector((open) => !open)}
            className="h-8 text-xs column-selector-toggle"
            title="Configure visible columns"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
            Columns
          </Button>
          {showColumnSelector && data?.[0] && (
            <ColumnSelectorPanel
              columnKeys={Object.keys(data[0])}
              enabledColumns={enabledColumns}
              filter={columnSelectorFilter}
              onFilterChange={setColumnSelectorFilter}
              onToggleColumn={toggleColumnVisibility}
              onToggleAll={toggleAllColumns}
              onClose={() => setShowColumnSelector(false)}
            />
          )}
        </div>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSpreadsheetOptions((open) => !open)}
            className="h-8 text-xs spreadsheet-options-toggle"
            title="Spreadsheet display options"
          >
            <Grid3X3 className="h-3.5 w-3.5 mr-1" />
            View
          </Button>
          {showSpreadsheetOptions && (
            <SpreadsheetOptionsPanel
              showRowNumbers={showRowNumbers}
              zebraStripes={zebraStripes}
              showGridLines={showGridLines}
              onShowRowNumbers={setShowRowNumbers}
              onZebraStripes={setZebraStripes}
              onShowGridLines={setShowGridLines}
              onClose={() => setShowSpreadsheetOptions(false)}
            />
          )}
        </div>
        {Object.keys(userResizedColumns).length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUserResizedColumns({})}
            className="h-8 text-xs"
            title="Reset column widths"
          >
            Reset Size
          </Button>
        )}
        <ExportMenu data={data} {...exporters} />

        {/* Selection indicator */}
        {selectedCells.size > 0 && (
          <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-primary/10 rounded-md border">
            <span className="text-xs text-muted-foreground">
              {selectedCells.size} cell{selectedCells.size !== 1 ? "s" : ""} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCells(new Set())}
              className="h-6 px-2 text-xs hover:bg-primary/20"
            >
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableToolbar;
