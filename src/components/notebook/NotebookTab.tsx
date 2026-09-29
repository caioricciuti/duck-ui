import { useState, useCallback, useRef, useMemo } from "react";
import { useDuckStore } from "@/store";
import type { NotebookCell, NotebookCellType } from "@/store/types";
import { kernelForNotebook, peekPythonKernel } from "@/services/python";
import { NotebookCellComponent, type PythonLiveState } from "./NotebookCell";
import { NotebookToolbar } from "./NotebookToolbar";
import QueryParamsBar from "@/components/editor/QueryParamsBar";
import { listParameterNames, missingParamsMessage, resolveQueryParams } from "@/lib/sqlParams";
import { toast } from "sonner";

interface NotebookTabProps {
  tabId: string;
}

export default function NotebookTab({ tabId }: NotebookTabProps) {
  const tabs = useDuckStore((s) => s.tabs);
  const addCell = useDuckStore((s) => s.addNotebookCell);
  const updateCellResult = useDuckStore((s) => s.updateNotebookCellResult);
  const updateCellPythonOutput = useDuckStore((s) => s.updateNotebookCellPythonOutput);
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

  // Parameters are notebook-wide: `$region` means the same thing in every
  // cell, so one bar serves them all.
  const paramNames = useMemo(
    () => [
      ...new Set(
        cells
          .filter((cell) => cell.type === "sql")
          .flatMap((cell) => listParameterNames(cell.content))
      ),
    ],
    [cells]
  );

  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());
  const [pythonLive, setPythonLive] = useState<Record<string, PythonLiveState>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);
  const abortRef = useRef(false);

  const setLive = useCallback((cellId: string, patch: Partial<PythonLiveState> | null) => {
    setPythonLive((prev) => {
      const next = { ...prev };
      if (patch === null) delete next[cellId];
      else {
        const base: PythonLiveState = prev[cellId] ?? { status: "", stdout: "", stderr: "" };
        next[cellId] = { ...base, ...patch };
      }
      return next;
    });
  }, []);

  const runPythonCell = useCallback(
    async (cellId: string, code: string) => {
      const kernel = kernelForNotebook(tabId, {
        getSession: () => useDuckStore.getState().currentSession,
        getMaxRows: () => useDuckStore.getState().maxResultRows,
      });
      setLive(cellId, { status: kernel.isBusy ? "Queued…" : "" });
      const output = await kernel.run(code, {
        onStatus: (status) => setLive(cellId, { status }),
        onStream: (streams) => setLive(cellId, streams),
      });
      updateCellPythonOutput(tabId, cellId, output);
      setLive(cellId, null);
    },
    [tabId, setLive, updateCellPythonOutput]
  );

  const runCell = useCallback(
    async (cellId: string) => {
      const currentCells = useDuckStore.getState().getNotebookCells(tabId);
      const cell = currentCells.find((c: NotebookCell) => c.id === cellId);
      if (!cell || (cell.type !== "sql" && cell.type !== "python") || !cell.content.trim()) return;

      setRunningCells((prev) => new Set(prev).add(cellId));

      try {
        if (cell.type === "python") {
          await runPythonCell(cellId, cell.content);
          return;
        }
        const params = useDuckStore.getState().tabs.find((t) => t.id === tabId)?.queryParams;
        const resolved = resolveQueryParams(cell.content.trim(), params);
        if (resolved.sql === null) throw new Error(missingParamsMessage(resolved.missing));
        const result = await executeQuery(resolved.sql);
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
    [tabId, executeQuery, updateCellResult, runPythonCell]
  );

  const interruptPython = useCallback(() => {
    // One kernel per notebook: interrupting replaces the worker, so a Run All
    // in progress stops too — later cells would run against lost state.
    abortRef.current = true;
    peekPythonKernel(tabId)?.interrupt();
  }, [tabId]);

  const runAllCells = useCallback(async () => {
    const currentCells = useDuckStore.getState().getNotebookCells(tabId);
    const runnable = currentCells.filter(
      (c: NotebookCell) => (c.type === "sql" || c.type === "python") && c.content.trim()
    );
    if (runnable.length === 0) return;

    setIsRunningAll(true);
    abortRef.current = false;

    let completed = 0;
    for (const cell of runnable) {
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
    (afterCellId: string, type: NotebookCellType) => {
      addCell(tabId, afterCellId, type);
    },
    [addCell, tabId]
  );

  const handleAddCellAtEnd = useCallback(
    (type: NotebookCellType) => {
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
      <QueryParamsBar tabId={tabId} names={paramNames} />

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
              pythonLive={pythonLive[cell.id]}
              onRun={runCell}
              onInterrupt={interruptPython}
              onAddCell={handleAddCell}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
