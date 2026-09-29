import React from "react";
import { flexRender, type ColumnDef, type Row, type Table } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ROW_HEIGHT } from "./constants";
import type { CellPosition, ContextMenuPosition, DataRow, ViewedCell } from "./types";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

interface DataGridProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  tableHeight: string | number;
  table: Table<DataRow>;
  columns: ColumnDef<DataRow>[];
  rows: Row<DataRow>[];
  virtualRows: VirtualItem[];
  paddingTop: number;
  paddingBottom: number;
  showGridLines: boolean;
  zebraStripes: boolean;
  selectedCells: Set<string>;
  setSelectedCells: Setter<Set<string>>;
  lastSelectedCell: CellPosition | null;
  setLastSelectedCell: Setter<CellPosition | null>;
  isDragging: boolean;
  setIsDragging: Setter<boolean>;
  dragStart: CellPosition | null;
  setDragStart: Setter<CellPosition | null>;
  setDragEnd: Setter<CellPosition | null>;
  setContextMenu: Setter<ContextMenuPosition | null>;
  createSelectionRange: (start: CellPosition, end: CellPosition) => Set<string>;
  setViewedCell: Setter<ViewedCell | null>;
}

/** Scrollable, virtualized table: resizable headers and selectable cells. */
const DataGrid: React.FC<DataGridProps> = ({
  scrollRef,
  tableHeight,
  table,
  columns,
  rows,
  virtualRows,
  paddingTop,
  paddingBottom,
  showGridLines,
  zebraStripes,
  selectedCells,
  setSelectedCells,
  lastSelectedCell,
  setLastSelectedCell,
  isDragging,
  setIsDragging,
  dragStart,
  setDragStart,
  setDragEnd,
  setContextMenu,
  createSelectionRange,
  setViewedCell,
}) => {
  return (
    <div
      className={`flex-1 rounded-md bg-card relative overflow-hidden ${
        showGridLines ? "border-2" : "border"
      } border-border`}
    >
      <div
        ref={scrollRef}
        className="h-full w-full overflow-auto"
        style={{
          height: typeof tableHeight === "string" ? tableHeight : `${tableHeight}px`,
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            width: table.getTotalSize(),
            minWidth: "100%",
            maxWidth: "max-content",
            position: "relative",
          }}
        >
          <table
            className={`w-full border-collapse table-fixed ${
              showGridLines ? "border-spacing-0" : ""
            }`}
          >
            <thead
              className={`sticky top-0 z-10 bg-muted/70 backdrop-blur-sm ${
                showGridLines ? "border-b-2 border-border" : "shadow-sm"
              }`}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border/40">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`h-9 px-0 text-left align-middle font-medium text-muted-foreground whitespace-nowrap text-xs relative select-none ${
                        showGridLines ? "border-r border-border/50" : ""
                      }`}
                      style={{
                        width: header.getSize(),
                        minWidth: header.column.columnDef.minSize, // From columnDef
                        maxWidth: header.column.columnDef.maxSize, // From columnDef
                      }}
                    >
                      <div className="flex items-center justify-between w-full h-full px-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                      {header.column.getCanResize() && (
                        <div
                          className={`absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none group ${
                            header.column.getIsResizing() ? "bg-primary/20" : ""
                          }`}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          style={{ userSelect: "none" }}
                        >
                          <div
                            className={`w-[1px] h-4/6 my-auto ${
                              header.column.getIsResizing()
                                ? "bg-primary w-[2px]"
                                : "bg-border/60 group-hover:bg-primary/60 group-hover:w-[2px]"
                            }`}
                          />
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody
              className="bg-card text-card-foreground relative"
              style={{ userSelect: isDragging ? "none" : "auto" }}
            >
              {paddingTop > 0 && (
                <tr style={{ height: `${paddingTop}px` }}>
                  <td colSpan={table.getVisibleLeafColumns().length} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                  <tr
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    className={`transition-colors ${
                      zebraStripes && virtualRow.index % 2 === 0
                        ? "hover:bg-muted/40" // Stronger hover for zebra striped rows
                        : "hover:bg-muted/20" // Subtle hover for regular rows
                    } ${row.getIsSelected() ? "bg-muted" : ""} ${
                      zebraStripes && virtualRow.index % 2 === 0 ? "bg-muted/20" : "bg-background"
                    } ${showGridLines ? "border-b border-border/30" : ""}`}
                    style={{ height: `${ROW_HEIGHT}px` }} // Use fixed ROW_HEIGHT
                  >
                    {row.getVisibleCells().map((cell) => {
                      const cellKey = `${virtualRow.index}::${cell.column.id}`;
                      const isSelected = selectedCells.has(cellKey);

                      return (
                        <td
                          key={cell.id}
                          className={`align-middle overflow-hidden relative ${
                            showGridLines ? "border-r border-border/30" : ""
                          } ${isSelected ? "bg-primary/20 ring-1 ring-primary/30" : ""} ${
                            isDragging ? "cursor-crosshair" : "cursor-cell"
                          }`}
                          style={{
                            width: cell.column.getSize(),
                            minWidth: cell.column.columnDef.minSize,
                            maxWidth: cell.column.columnDef.maxSize,
                          }}
                          onMouseDown={(e) => {
                            if (cell.column.id !== "__row_number__" && e.button === 0) {
                              e.preventDefault();
                              const currentPosition = {
                                row: virtualRow.index,
                                col: cell.column.id,
                              };

                              if (e.shiftKey && lastSelectedCell) {
                                // Shift+click: select rectangular range using helper function
                                const rangeSelection = createSelectionRange(
                                  lastSelectedCell,
                                  currentPosition
                                );
                                setSelectedCells(rangeSelection);
                              } else if (e.ctrlKey || e.metaKey) {
                                // Ctrl/Cmd+click: toggle cell in selection
                                const newSelection = new Set(selectedCells);
                                if (newSelection.has(cellKey)) {
                                  newSelection.delete(cellKey);
                                } else {
                                  newSelection.add(cellKey);
                                }
                                setSelectedCells(newSelection);
                                setLastSelectedCell(currentPosition);
                              } else {
                                // Regular click: select only this cell and start drag
                                setSelectedCells(new Set([cellKey]));
                                setLastSelectedCell(currentPosition);

                                // Start drag selection
                                setIsDragging(true);
                                setDragStart(currentPosition);
                                setDragEnd(currentPosition);
                              }
                            }
                          }}
                          onMouseEnter={() => {
                            if (isDragging && dragStart && cell.column.id !== "__row_number__") {
                              const currentPosition = {
                                row: virtualRow.index,
                                col: cell.column.id,
                              };
                              setDragEnd(currentPosition);

                              // Update selection during drag
                              const dragSelection = createSelectionRange(
                                dragStart,
                                currentPosition
                              );
                              setSelectedCells(dragSelection);
                            }
                          }}
                          onContextMenu={(e) => {
                            if (cell.column.id !== "__row_number__") {
                              e.preventDefault();
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                              });
                              if (!selectedCells.has(cellKey)) {
                                setSelectedCells(new Set([cellKey]));
                              }
                            }
                          }}
                          onDoubleClick={() => {
                            if (cell.column.id !== "__row_number__") {
                              const cellValue = cell.getValue();
                              setViewedCell({
                                value: cellValue,
                                columnName: cell.column.id,
                                rowIndex: virtualRow.index,
                              });
                            }
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr style={{ height: `${paddingBottom}px` }}>
                  <td colSpan={table.getVisibleFlatColumns().length} />
                </tr>
              )}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length || 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No results match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DataGrid;
