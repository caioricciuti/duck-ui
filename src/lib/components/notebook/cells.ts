import type { NotebookCell, NotebookCellType } from "@/store/types";

/** Streamed state of a Python cell while it runs. */
export interface PythonLiveState {
  status: string;
  stdout: string;
  stderr: string;
}

/** Cell types this build can edit; anything else came from a newer peer. */
export const isKnownCellType = (type: string): type is NotebookCellType =>
  type === "sql" || type === "markdown" || type === "python";

export const isCodeCell = (type: string): type is "sql" | "python" =>
  type === "sql" || type === "python";

type OutputKey = "result" | "pythonOutput" | "chartConfig";
const OUTPUT_KEYS: OutputKey[] = ["result", "pythonOutput", "chartConfig"];

interface CachedOutput {
  json: string;
  value: unknown;
}

/**
 * Keeps the output objects of a cell identical across parses.
 *
 * Cells live in the store as one JSON string, so every keystroke in any cell
 * yields brand new `result` objects for all of them. The grid and the chart
 * treat a new object as a new result and would drop their sort, filters and
 * scroll position. Reusing the previous object when its JSON did not change
 * keeps them steady.
 */
export class CellOutputCache {
  private entries = new Map<string, Partial<Record<OutputKey, CachedOutput>>>();

  reconcile(cells: NotebookCell[]): NotebookCell[] {
    const next = new Map<string, Partial<Record<OutputKey, CachedOutput>>>();
    const out = cells.map((cell) => {
      const previous = this.entries.get(cell.id) ?? {};
      const kept: Partial<Record<OutputKey, CachedOutput>> = {};
      const stable: NotebookCell = { ...cell };
      for (const key of OUTPUT_KEYS) {
        const value = cell[key];
        if (value === undefined || value === null) continue;
        const json = JSON.stringify(value);
        const cached = previous[key];
        const entry = cached && cached.json === json ? cached : { json, value };
        kept[key] = entry;
        // The cached value has the same JSON, so it has the same type.
        (stable as unknown as Record<OutputKey, unknown>)[key] = entry.value;
      }
      next.set(cell.id, kept);
      return stable;
    });
    this.entries = next;
    return out;
  }
}
