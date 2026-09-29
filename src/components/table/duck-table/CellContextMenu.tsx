import React from "react";
import { Download, Copy, MousePointer, MoreHorizontal } from "lucide-react";
import type { ContextMenuPosition, DataRow } from "./types";

interface CellContextMenuProps {
  contextMenu: ContextMenuPosition | null;
  setContextMenu: (position: ContextMenuPosition | null) => void;
  data: DataRow[];
  selectedCells: Set<string>;
  setSelectedCells: (cells: Set<string>) => void;
  copySelectedCells: () => void;
  selectAllCells: () => void;
  exportToCSV: () => void;
}

/** Right-click menu for selected cells. */
const CellContextMenu: React.FC<CellContextMenuProps> = ({
  contextMenu,
  setContextMenu,
  data,
  selectedCells,
  setSelectedCells,
  copySelectedCells,
  selectAllCells,
  exportToCSV,
}) => {
  if (!contextMenu) return null;

  return (
    <div
      // Right-clicking near an edge would otherwise push items off-screen
      // where they can't be clicked. Flip the menu back over the cursor once
      // its real size is known, the way a native context menu does.
      ref={(node) => {
        if (!node) return;
        node.style.left = `${contextMenu.x}px`;
        node.style.top = `${contextMenu.y}px`;
        const rect = node.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          node.style.left = `${Math.max(4, contextMenu.x - rect.width)}px`;
        }
        if (rect.bottom > window.innerHeight) {
          node.style.top = `${Math.max(4, contextMenu.y - rect.height)}px`;
        }
      }}
      className="context-menu fixed z-20 bg-background border border-border rounded-md shadow-lg py-1 min-w-[160px] max-h-[calc(100vh-8px)] overflow-y-auto"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        onClick={() => {
          copySelectedCells();
          setContextMenu(null);
        }}
      >
        <Copy className="h-3 w-3" />
        Copy
      </button>
      <button
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        onClick={() => {
          selectAllCells();
          setContextMenu(null);
        }}
      >
        <MousePointer className="h-3 w-3" />
        Select All
      </button>
      <button
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        onClick={() => {
          // Select row
          if (selectedCells.size > 0) {
            const firstCell = Array.from(selectedCells)[0];
            const rowIndex = parseInt(firstCell.split("::")[0]);
            if (data[0]) {
              const rowCells = new Set<string>();
              Object.keys(data[0]).forEach((key) => {
                if (key !== "__row_number__") {
                  rowCells.add(`${rowIndex}::${key}`);
                }
              });
              setSelectedCells(rowCells);
            }
          }
          setContextMenu(null);
        }}
      >
        <MoreHorizontal className="h-3 w-3" />
        Select Row
      </button>
      <button
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        onClick={() => {
          // Select column
          if (selectedCells.size > 0) {
            const firstCell = Array.from(selectedCells)[0];
            const colId = firstCell.split("::")[1];
            if (colId) {
              const colCells = new Set<string>();
              for (let i = 0; i < data.length; i++) {
                colCells.add(`${i}::${colId}`);
              }
              setSelectedCells(colCells);
            }
          }
          setContextMenu(null);
        }}
      >
        <MoreHorizontal className="h-3 w-3 rotate-90" />
        Select Column
      </button>
      <hr className="my-1 border-border" />
      <button
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
        onClick={() => {
          exportToCSV();
          setContextMenu(null);
        }}
      >
        <Download className="h-3 w-3" />
        Export...
      </button>
    </div>
  );
};

export default CellContextMenu;
