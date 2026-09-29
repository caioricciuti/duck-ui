import { useState, useEffect, useCallback } from "react";
import type { Row } from "@tanstack/react-table";
import { toast } from "sonner";
import type { CellPosition, ContextMenuPosition, DataRow } from "./types";
import { safeStringify } from "./utils";

/** Cell selection (click, shift/ctrl-click, drag), copy and select-all shortcuts. */
export function useCellSelection(data: DataRow[], rows: Row<DataRow>[]) {
  // Cell selection state
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastSelectedCell, setLastSelectedCell] = useState<CellPosition | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<CellPosition | null>(null);
  const [dragEnd, setDragEnd] = useState<CellPosition | null>(null);

  // Helper function to create selection range between two points
  const createSelectionRange = (start: CellPosition, end: CellPosition): Set<string> => {
    const selection = new Set<string>();
    if (!data || !data[0]) return selection;

    const columns = Object.keys(data[0]);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const startColIndex = columns.indexOf(start.col);
    const endColIndex = columns.indexOf(end.col);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);

    for (let row = minRow; row <= maxRow && row < data.length; row++) {
      for (let colIdx = minColIndex; colIdx <= maxColIndex && colIdx < columns.length; colIdx++) {
        const col = columns[colIdx];
        if (col !== "__row_number__") {
          selection.add(`${row}::${col}`);
        }
      }
    }

    return selection;
  };

  // Shared by the Ctrl/Cmd+C shortcut and the context menu's Copy item.
  const copySelectedCells = useCallback(() => {
    if (selectedCells.size === 0) return;

    // Get selected cells data organized by row and column
    const cellsByPosition = new Map<string, unknown>();
    const rowIndices = new Set<number>();
    const columnIds = new Set<string>();

    selectedCells.forEach((cellKey) => {
      const [rowStr, colId] = cellKey.split("::");
      const rowIndex = parseInt(rowStr);
      rowIndices.add(rowIndex);
      columnIds.add(colId);

      const row = rows[rowIndex];
      if (row) {
        const cell = row.getAllCells().find((c) => c.column.id === colId);
        if (cell) {
          cellsByPosition.set(cellKey, cell.getValue());
        }
      }
    });

    // Sort rows and columns
    const sortedRows = Array.from(rowIndices).sort((a, b) => a - b);
    const sortedCols = Array.from(columnIds);

    // Build TSV string for Excel/Sheets compatibility
    const tsvRows: string[] = [];
    sortedRows.forEach((rowIndex) => {
      const rowValues: string[] = [];
      sortedCols.forEach((colId) => {
        const cellKey = `${rowIndex}::${colId}`;
        const value = cellsByPosition.get(cellKey);
        if (value !== undefined) {
          const strValue = value === null ? "" : safeStringify(value);
          rowValues.push(strValue);
        } else if (selectedCells.has(cellKey)) {
          rowValues.push("");
        }
      });
      if (rowValues.length > 0) {
        tsvRows.push(rowValues.join("\t"));
      }
    });

    const tsvContent = tsvRows.join("\n");
    navigator.clipboard.writeText(tsvContent).then(() => {
      toast.success(`Copied ${selectedCells.size} cells to clipboard`);

      // Visual feedback - flash selected cells
      const tempCells = new Set(selectedCells);
      setSelectedCells(new Set());
      setTimeout(() => setSelectedCells(tempCells), 100);
    });
  }, [selectedCells, rows]);

  // Shared by the Ctrl/Cmd+A shortcut and the context menu's Select All item.
  const selectAllCells = useCallback(() => {
    const allCells = new Set<string>();
    rows.forEach((row, rowIndex) => {
      row.getVisibleCells().forEach((cell) => {
        if (cell.column.id !== "__row_number__") {
          allCells.add(`${rowIndex}::${cell.column.id}`);
        }
      });
    });
    setSelectedCells(allCells);
  }, [rows]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + C to copy selected cells
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedCells.size > 0) {
        e.preventDefault();
        copySelectedCells();
      }

      // Ctrl/Cmd + A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selectAllCells();
      }

      // Escape to clear selection
      if (e.key === "Escape") {
        setSelectedCells(new Set());
        setContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCells, copySelectedCells, selectAllCells]);

  // Handle mouse up globally for drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (dragEnd) {
          setLastSelectedCell(dragEnd);
        }
      }
    };

    if (isDragging) {
      document.addEventListener("mouseup", handleMouseUp);
      return () => document.removeEventListener("mouseup", handleMouseUp);
    }
  }, [isDragging, dragEnd, setLastSelectedCell]);

  return {
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
  };
}
