import { useState, useCallback, useRef, useMemo } from "react";
import { useDuckStore } from "@/store";
import type { NotebookCell } from "@/store/types";
import { NotebookCellComponent } from "./NotebookCell";
import { NotebookToolbar } from "./NotebookToolbar";
import { toast } from "sonner";

interface NotebookTabProps {
  tabId: string;
}

export default function NotebookTab({ tabId }: NotebookTabProps) {
  const tabs = useDuckStore((s) => s.tabs);
  const addCell = useDuckStore((s) => s.addNotebookCell);
  const updateCellResult = useDuckStore((s) => s.updateNotebookCellResult);
  const executeQuery = useDuckStore((s) => s.executeQuery);

  const currentTab = tabs.find((t) => t.id === tabId);
  const cells = useMemo((): NotebookCell[] => {
    if (!currentTab || currentTab.type !== "notebook" || typeof currentTab.content !== "string") {
      return [];
    }
    try {
      return JSON.parse(currentTab.content) as NotebookCell[];
    } catch {
      return [];
    }
  }, [currentTab]);

  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);
  const abortRef = useRef(false);

  const runCell = useCallback(
    async (cellId: string) => {
      const currentCells = useDuckStore.getState().getNotebookCells(tabId);
      const cell = currentCells.find((c: NotebookCell) => c.id === cellId);
      if (!cell || cell.type !== "sql" || !cell.content.trim()) return;

      setRunningCells((prev) => new Set(prev).add(cellId));

      try {
        const result = await executeQuery(cell.content.trim());
        if (result) {
          updateCellResult(tabId, cellId, result);
        }
      } catch (error) {
        updateCellResult(tabId, cellId, {
          columns: [],
          columnTypes: [],
          data: [],
          rowCount: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setRunningCells((prev) => {
          const next = new Set(prev);
          next.delete(cellId);
          return next;
        });
      }
    },
    [tabId, executeQuery, updateCellResult]
  );

  const runAllCells = useCallback(async () => {
    const currentCells = useDuckStore.getState().getNotebookCells(tabId);
    const sqlCells = currentCells.filter((c: NotebookCell) => c.type === "sql" && c.content.trim());
    if (sqlCells.length === 0) return;

    setIsRunningAll(true);
    abortRef.current = false;

    let completed = 0;
    for (const cell of sqlCells) {
      if (abortRef.current) break;
      await runCell(cell.id);
      completed++;
    }

    setIsRunningAll(false);
    if (!abortRef.current) {
      toast.success(`Executed ${completed} cell${completed !== 1 ? "s" : ""}`);
    }
  }, [tabId, runCell]);

  const handleAddCell = useCallback(
    (afterCellId: string, type: "sql" | "markdown") => {
      addCell(tabId, afterCellId, type);
    },
    [addCell, tabId]
  );

  const handleAddCellAtEnd = useCallback(
    (type: "sql" | "markdown") => {
      const lastCell = cells[cells.length - 1];
      addCell(tabId, lastCell?.id, type);
    },
    [addCell, tabId, cells]
  );

  return (
    <div className="h-full flex flex-col">
      <NotebookToolbar
        onRunAll={runAllCells}
        onAddCell={handleAddCellAtEnd}
        isRunning={isRunningAll}
        cellCount={cells.length}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-4 px-4 space-y-5">
          {cells.map((cell, index) => (
            <NotebookCellComponent
              key={cell.id}
              cell={cell}
              tabId={tabId}
              cellIndex={index}
              totalCells={cells.length}
              isRunning={runningCells.has(cell.id)}
              onRun={runCell}
              onAddCell={handleAddCell}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
