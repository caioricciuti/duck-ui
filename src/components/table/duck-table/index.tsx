import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnResizeMode,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes, formatDuration } from "@/lib/utils";
import { Clock } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CellValueViewer } from "../CellValueViewer";
import { ColumnStatsPanel } from "../ColumnStatsPanel";
import CellContextMenu from "./CellContextMenu";
import { buildColumns } from "./columns";
import { ALL_ROWS, ROW_HEIGHT } from "./constants";
import DataGrid from "./DataGrid";
import PaginationBar from "./PaginationBar";
import TableToolbar from "./TableToolbar";
import { createTableExporters } from "./tableExport";
import type { DataRow, DuckTableProps, ViewedCell } from "./types";
import { useCellSelection } from "./useCellSelection";
import { useColumnState } from "./useColumnState";

const DuckUITable: React.FC<DuckTableProps> = ({
  data = [],
  executionTime,
  responseSize,
  initialPageSize = ALL_ROWS,
  columnRenderers,
  tableHeight = "100%",
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [globalFilterInput, setGlobalFilterInput] = useState("");

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [columnSelectorFilter, setColumnSelectorFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  // New spreadsheet features
  const [showRowNumbers, setShowRowNumbers] = useState(false);
  const [zebraStripes, setZebraStripes] = useState(true);
  const [showGridLines, setShowGridLines] = useState(false);
  const [showSpreadsheetOptions, setShowSpreadsheetOptions] = useState(false);

  // Cell value viewer state
  const [viewedCell, setViewedCell] = useState<ViewedCell | null>(null);

  // Column stats panel state
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [statsPanelMinimized, setStatsPanelMinimized] = useState(false);

  const columnResizeMode = "onChange" as ColumnResizeMode;

  useEffect(() => {
    const handler = setTimeout(() => setGlobalFilter(globalFilterInput), 300);
    return () => clearTimeout(handler);
  }, [globalFilterInput]);

  useEffect(() => {
    if (globalFilter !== globalFilterInput) setGlobalFilterInput(globalFilter);
    // Sync only when the committed filter changes externally, not while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter]);

  const {
    enabledColumns,
    columnSizing,
    userResizedColumns,
    setUserResizedColumns,
    handleColumnSizeChange,
    toggleColumnVisibility,
    toggleAllColumns,
  } = useColumnState(data);

  const columns = useMemo<ColumnDef<DataRow>[]>(
    () => buildColumns({ data, enabledColumns, columnRenderers, showRowNumbers }),
    [data, enabledColumns, columnRenderers, showRowNumbers]
  );

  // TanStack Table is not React Compiler compatible; memoization is manual here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    columnResizeMode,
    state: {
      columnFilters,
      globalFilter,
      pagination,
      columnSizing,
      sorting,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnSizingChange: handleColumnSizeChange,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableGlobalFilter: true,
    enableColumnResizing: true,
    enableSorting: true,
    debugTable: false,
  });

  const { rows } = table.getRowModel();

  const {
    selectedCells,
    setSelectedCells,
    lastSelectedCell,
    setLastSelectedCell,
    contextMenu,
    setContextMenu,
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    setDragEnd,
    createSelectionRange,
    copySelectedCells,
    selectAllCells,
  } = useCellSelection(data, rows);

  // Close column selector and context menu on outside click (Issue #5, #6)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Close column selector if clicking outside. The toggle button is
      // excluded — otherwise mousedown closes the panel and the click reopens
      // it, so the menu appears to never close.
      if (
        showColumnSelector &&
        !target.closest(".column-selector-panel") &&
        !target.closest(".column-selector-toggle")
      ) {
        setShowColumnSelector(false);
      }

      // Close spreadsheet options if clicking outside
      if (
        showSpreadsheetOptions &&
        !target.closest(".spreadsheet-options-panel") &&
        !target.closest(".spreadsheet-options-toggle")
      ) {
        setShowSpreadsheetOptions(false);
      }

      // Close the context menu — but not when the mousedown is ON the menu,
      // otherwise the menu unmounts before its buttons' click events fire and
      // every item appears to do nothing.
      if (contextMenu && !target.closest(".context-menu")) {
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnSelector, showSpreadsheetOptions, contextMenu, setContextMenu]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => horizontalScrollRef.current,
    overscan: 10, // Lowered slightly, adjust as needed
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  const exporters = createTableExporters(data, table);

  // Recreated each render (as before the split), so the menu remounts and its
  // ref callback re-measures on every render while open.
  const ContextMenu = () => (
    <CellContextMenu
      contextMenu={contextMenu}
      setContextMenu={setContextMenu}
      data={data}
      selectedCells={selectedCells}
      setSelectedCells={setSelectedCells}
      copySelectedCells={copySelectedCells}
      selectAllCells={selectAllCells}
      exportToCSV={exporters.exportToCSV}
    />
  );

  if (!data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-32 text-muted-foreground">
        No data available.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full w-full min-w-0 overflow-hidden" ref={tableContainerRef}>
        {/* Top controls area */}
        <TableToolbar
          data={data}
          table={table}
          executionTime={executionTime}
          responseSize={responseSize}
          globalFilterInput={globalFilterInput}
          setGlobalFilterInput={setGlobalFilterInput}
          showStatsPanel={showStatsPanel}
          setShowStatsPanel={setShowStatsPanel}
          setStatsPanelMinimized={setStatsPanelMinimized}
          showColumnSelector={showColumnSelector}
          setShowColumnSelector={setShowColumnSelector}
          enabledColumns={enabledColumns}
          columnSelectorFilter={columnSelectorFilter}
          setColumnSelectorFilter={setColumnSelectorFilter}
          toggleColumnVisibility={toggleColumnVisibility}
          toggleAllColumns={toggleAllColumns}
          showSpreadsheetOptions={showSpreadsheetOptions}
          setShowSpreadsheetOptions={setShowSpreadsheetOptions}
          showRowNumbers={showRowNumbers}
          setShowRowNumbers={setShowRowNumbers}
          zebraStripes={zebraStripes}
          setZebraStripes={setZebraStripes}
          showGridLines={showGridLines}
          setShowGridLines={setShowGridLines}
          userResizedColumns={userResizedColumns}
          setUserResizedColumns={setUserResizedColumns}
          selectedCells={selectedCells}
          setSelectedCells={setSelectedCells}
          exporters={exporters}
        />

        {/* Main table area */}
        <DataGrid
          scrollRef={horizontalScrollRef}
          tableHeight={tableHeight}
          table={table}
          columns={columns}
          rows={rows}
          virtualRows={virtualRows}
          paddingTop={paddingTop}
          paddingBottom={paddingBottom}
          showGridLines={showGridLines}
          zebraStripes={zebraStripes}
          selectedCells={selectedCells}
          setSelectedCells={setSelectedCells}
          lastSelectedCell={lastSelectedCell}
          setLastSelectedCell={setLastSelectedCell}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          dragStart={dragStart}
          setDragStart={setDragStart}
          setDragEnd={setDragEnd}
          setContextMenu={setContextMenu}
          createSelectionRange={createSelectionRange}
          setViewedCell={setViewedCell}
        />

        {/* Pagination controls */}
        <PaginationBar table={table} />

        {/* Context Menu */}
        <ContextMenu />

        {/* Cell Value Viewer */}
        {viewedCell && (
          <CellValueViewer
            value={viewedCell.value}
            columnName={viewedCell.columnName}
            rowIndex={viewedCell.rowIndex}
            onClose={() => setViewedCell(null)}
          />
        )}

        {/* Column Stats Panel */}
        {showStatsPanel && (
          <ColumnStatsPanel
            data={table.getFilteredRowModel().rows.map((r) => r.original)}
            onClose={() => setShowStatsPanel(false)}
            isMinimized={statsPanelMinimized}
            onToggleMinimize={() => setStatsPanelMinimized(!statsPanelMinimized)}
          />
        )}

        {/* Mobile stats */}
        <div className="md:hidden flex items-center justify-between text-xs text-muted-foreground py-2 border-t border-border/30 mt-2 flex-shrink-0">
          <span>
            {table.getFilteredRowModel().rows.length} of {data.length} rows
          </span>
          <div className="flex items-center gap-x-3">
            {executionTime !== null && executionTime !== undefined && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(executionTime)}</span>
              </div>
            )}
            {responseSize !== null && responseSize !== undefined && (
              <div className="flex items-center">
                <span>{formatBytes(responseSize)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default React.memo(DuckUITable);
