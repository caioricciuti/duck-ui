import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { diffStrings } from "@/lib/textDiff";
import {
  Play,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Code,
  Type,
  ChevronRight,
  BarChart3,
  Table,
  Plus,
  Square,
  SquareTerminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDuckStore } from "@/store";
import type {
  NotebookCell as NotebookCellType,
  NotebookCellType as CellKind,
  PythonCellOutput,
  QueryResult,
  ChartConfig,
} from "@/store/types";
import { useTheme } from "@/components/theme/theme-provider";
import {
  createCellEditor,
  useMonacoConfig,
  type EditorInstance,
} from "@/components/editor/monacoConfig";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DuckUiTable from "@/components/table/DuckUItable";
import ChartVisualizationPro from "@/components/charts/ChartVisualizationPro";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CellErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="p-3 text-center">
    <p className="text-xs text-destructive mb-2">
      {error instanceof Error ? error.message : "Render error"}
    </p>
    <button onClick={resetErrorBoundary} className="text-xs px-2 py-1 bg-muted rounded">
      Retry
    </button>
  </div>
);

/** Streamed state of a Python cell while it runs. */
export interface PythonLiveState {
  status: string;
  stdout: string;
  stderr: string;
}

interface NotebookCellProps {
  cell: NotebookCellType;
  tabId: string;
  cellIndex: number;
  totalCells: number;
  isRunning: boolean;
  pythonLive?: PythonLiveState;
  onRun: (cellId: string) => void;
  onInterrupt: (cellId: string) => void;
  onAddCell: (afterCellId: string, type: CellKind) => void;
}

/** Cell types this build can edit; anything else came from a newer peer. */
const isKnownCellType = (type: string): type is CellKind =>
  type === "sql" || type === "markdown" || type === "python";

export function NotebookCellComponent({
  cell,
  tabId,
  cellIndex,
  totalCells,
  isRunning,
  pythonLive,
  onRun,
  onInterrupt,
  onAddCell,
}: NotebookCellProps) {
  const isCode = cell.type === "sql" || cell.type === "python";
  const [isEditing, setIsEditing] = useState(isCode || !cell.content);
  const [isFocused, setIsFocused] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<EditorInstance | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { theme } = useTheme();
  const monacoConfig = useMonacoConfig(theme);

  const updateCellContent = useDuckStore((s) => s.updateNotebookCellContent);
  const updateCellChartConfig = useDuckStore((s) => s.updateNotebookCellChartConfig);
  const removeCell = useDuckStore((s) => s.removeNotebookCell);
  const moveCell = useDuckStore((s) => s.moveNotebookCell);
  const toggleCollapsed = useDuckStore((s) => s.toggleNotebookCellCollapsed);
  const toggleCellType = useDuckStore((s) => s.toggleNotebookCellType);

  const pythonOutput = cell.type === "python" ? cell.pythonOutput : null;
  const hasResult =
    (cell.type === "sql" && cell.result && !cell.result.error && cell.result.data.length > 0) ||
    (!!pythonOutput && !pythonOutput.error);
  const hasError = (cell.type === "sql" && cell.result?.error) || !!pythonOutput?.error;
  const hasPythonOutput = cell.type === "python" && (!!pythonOutput || !!pythonLive);

  // Status indicator
  const statusColor = useMemo(() => {
    if (isRunning) return "bg-blue-500 animate-pulse";
    if (hasError) return "bg-red-500";
    if (hasResult) return "bg-green-500";
    return "bg-muted-foreground/30";
  }, [isRunning, hasError, hasResult]);

  // Stable callbacks for the cell editor
  const executeCallback = useCallback(async () => {
    onRun(cell.id);
  }, [onRun, cell.id]);

  const contentChangeCallback = useCallback(
    (value: string) => {
      updateCellContent(tabId, cell.id, value);
    },
    [tabId, cell.id, updateCellContent]
  );

  // SQL/Python cell: Monaco editor
  useEffect(() => {
    if ((cell.type !== "sql" && cell.type !== "python") || !editorRef.current) return;

    const compactConfig = {
      ...monacoConfig,
      lineNumbers: "on" as const,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 8 },
      fontSize: 13,
    };

    editorInstanceRef.current = createCellEditor(
      editorRef.current,
      compactConfig,
      cell.content,
      executeCallback,
      contentChangeCallback,
      cell.type
    );

    // Auto-resize editor height based on content
    const editor = editorInstanceRef.current.editor;
    const updateHeight = () => {
      const lineCount = editor.getModel()?.getLineCount() ?? 1;
      const lineHeight = 19;
      const minHeight = 60;
      const maxHeight = 400;
      const height = Math.min(Math.max(lineCount * lineHeight + 16, minHeight), maxHeight);
      if (editorRef.current) {
        editorRef.current.style.height = `${height}px`;
        editor.layout();
      }
    };

    const contentDisposable = editor.onDidChangeModelContent(updateHeight);
    updateHeight();

    return () => {
      contentDisposable.dispose();
      if (editorInstanceRef.current) {
        editorInstanceRef.current.dispose();
        editorInstanceRef.current = null;
      }
    };
    // cell.content only seeds the editor; including it would rebuild the
    // editor on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.type, cell.id, monacoConfig, executeCallback, contentChangeCallback]);

  // Sync content if changed externally — applied as a MINIMAL edit rather
  // than setValue. In a live session a peer's keystrokes arrive through here,
  // and replacing the whole model would reset the undo stack and drag the
  // caret to wherever the restored position lands; a targeted edit leaves
  // both alone unless the change overlaps the caret itself.
  useEffect(() => {
    if (cell.type !== "sql" && cell.type !== "python") return;
    const editor = editorInstanceRef.current?.editor;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const diff = diffStrings(model.getValue(), cell.content);
    if (!diff) return;
    const start = model.getPositionAt(diff.start);
    const end = model.getPositionAt(diff.start + diff.deleteLength);
    model.pushEditOperations(
      [],
      [
        {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          text: diff.insert,
        },
      ],
      () => null
    );
  }, [cell.content, cell.type]);

  // Markdown cell: auto-resize textarea
  const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateCellContent(tabId, cell.id, e.target.value);
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleMarkdownKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  // Auto-focus textarea on edit
  useEffect(() => {
    if (cell.type === "markdown" && isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Auto-resize on mount
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, cell.type]);

  const handleChartConfigChange = useCallback(
    (config: ChartConfig | undefined) => {
      updateCellChartConfig(tabId, cell.id, config);
    },
    [updateCellChartConfig, tabId, cell.id]
  );

  return (
    <div
      className={cn(
        "group relative border rounded-lg transition-all",
        isFocused ? "border-primary/50 shadow-sm" : "border-border hover:border-muted-foreground/30"
      )}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {/* Cell header */}
      <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 border-b rounded-t-lg">
        {/* Status dot */}
        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusColor)} />

        {/* Cell type badge */}
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-5 cursor-pointer hover:bg-muted"
          onClick={() => toggleCellType(tabId, cell.id)}
        >
          {cell.type === "sql" ? (
            <>
              <Code className="h-3 w-3 mr-1" />
              SQL
            </>
          ) : cell.type === "python" ? (
            <>
              <SquareTerminal className="h-3 w-3 mr-1" />
              PY
            </>
          ) : cell.type === "markdown" ? (
            <>
              <Type className="h-3 w-3 mr-1" />
              MD
            </>
          ) : (
            String(cell.type).toUpperCase()
          )}
        </Badge>

        {isRunning && pythonLive?.status && (
          <span className="text-[10px] text-muted-foreground ml-1 truncate">
            {pythonLive.status}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground ml-1">[{cellIndex + 1}]</span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Interrupt stays visible for as long as Python runs, not only on hover */}
        {cell.type === "python" && isRunning && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-[10px] text-destructive hover:text-destructive"
            onClick={() => onInterrupt(cell.id)}
            title="Stop this run. Restarts the Python kernel; variables are lost."
          >
            <Square className="h-3 w-3" />
            Interrupt
          </Button>
        )}

        {/* Cell actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isCode && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onRun(cell.id)}
              disabled={isRunning}
              aria-label="Run cell"
            >
              {isRunning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </Button>
          )}

          {((cell.type === "sql" && hasResult) || (cell.type === "python" && pythonOutput)) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => toggleCollapsed(tabId, cell.id)}
              aria-label={cell.collapsed ? "Expand output" : "Collapse output"}
            >
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", !cell.collapsed && "rotate-90")}
              />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => moveCell(tabId, cell.id, "up")}
            disabled={cellIndex === 0}
            aria-label="Move cell up"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => moveCell(tabId, cell.id, "down")}
            disabled={cellIndex === totalCells - 1}
            aria-label="Move cell down"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => removeCell(tabId, cell.id)}
            disabled={totalCells <= 1}
            aria-label="Delete cell"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Cell body */}
      <div className="min-h-[40px]">
        {isCode ? (
          <div ref={editorRef} className="w-full" style={{ minHeight: 60 }} />
        ) : !isKnownCellType(cell.type) ? (
          <div className="p-3">
            <p className="text-xs text-muted-foreground mb-2">
              Unsupported cell type &ldquo;{String(cell.type)}&rdquo; (likely from a newer Duck-UI).
              Shown read-only.
            </p>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">{cell.content}</pre>
          </div>
        ) : isEditing ? (
          <textarea
            ref={textareaRef}
            value={cell.content}
            onChange={handleMarkdownChange}
            onKeyDown={handleMarkdownKeyDown}
            onBlur={() => cell.content.trim() && setIsEditing(false)}
            placeholder="Write markdown here..."
            className="w-full p-3 bg-transparent resize-none outline-none text-sm font-mono min-h-[60px]"
          />
        ) : (
          <div className="p-3 cursor-pointer" onClick={() => setIsEditing(true)}>
            <MarkdownRenderer
              content={cell.content}
              className="prose prose-sm dark:prose-invert max-w-none"
            />
          </div>
        )}
      </div>

      {/* SQL cell results */}
      {cell.type === "sql" && cell.result && !cell.collapsed && (
        <div className="border-t">
          {cell.result.error ? (
            <div className="px-3 py-2 text-sm text-destructive bg-destructive/5">
              {cell.result.error}
            </div>
          ) : cell.result.data.length > 0 ? (
            <CellResults
              result={cell.result}
              chartConfig={cell.chartConfig}
              onChartConfigChange={handleChartConfigChange}
            />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Query executed successfully. {cell.result.rowCount} rows returned.
            </div>
          )}
        </div>
      )}

      {/* Python cell output */}
      {hasPythonOutput && !cell.collapsed && (
        <div className="border-t">
          <PythonOutputView
            output={isRunning ? null : (pythonOutput ?? null)}
            live={isRunning ? pythonLive : undefined}
            chartConfig={cell.chartConfig}
            onChartConfigChange={handleChartConfigChange}
          />
        </div>
      )}

      {/* Add cell button between cells */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-5 w-5 rounded-full bg-background shadow-sm"
              aria-label="Add cell"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="bottom">
            <DropdownMenuItem onClick={() => onAddCell(cell.id, "sql")}>
              <Code className="h-4 w-4 mr-2" />
              SQL Cell
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddCell(cell.id, "python")}>
              <SquareTerminal className="h-4 w-4 mr-2" />
              Python Cell
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddCell(cell.id, "markdown")}>
              <Type className="h-4 w-4 mr-2" />
              Markdown Cell
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Results sub-component with table/chart tabs
function CellResults({
  result,
  chartConfig,
  onChartConfigChange,
}: {
  result: QueryResult;
  chartConfig?: ChartConfig;
  onChartConfigChange: (config: ChartConfig | undefined) => void;
}) {
  return (
    <Tabs defaultValue="table" className="w-full">
      <TabsList className="mx-2 mt-1 h-7">
        <TabsTrigger value="table" className="text-xs h-6 gap-1 px-2">
          <Table className="w-3 h-3" />
          Table
        </TabsTrigger>
        <TabsTrigger value="chart" className="text-xs h-6 gap-1 px-2">
          <BarChart3 className="w-3 h-3" />
          Chart
        </TabsTrigger>
      </TabsList>
      <TabsContent value="table" className="mt-0">
        <div className="max-h-[400px] overflow-auto">
          <ErrorBoundary FallbackComponent={CellErrorFallback}>
            <DuckUiTable data={result.data} tableHeight={300} initialPageSize={50} />
          </ErrorBoundary>
        </div>
      </TabsContent>
      <TabsContent value="chart" className="mt-0">
        <div className="h-[350px]">
          <ErrorBoundary FallbackComponent={CellErrorFallback}>
            <ChartVisualizationPro
              result={result}
              chartConfig={chartConfig}
              onConfigChange={onChartConfigChange}
            />
          </ErrorBoundary>
        </div>
      </TabsContent>
    </Tabs>
  );
}

// Python output: streams, then the last expression (table or repr), then figures
function PythonOutputView({
  output,
  live,
  chartConfig,
  onChartConfigChange,
}: {
  output: PythonCellOutput | null;
  live?: PythonLiveState;
  chartConfig?: ChartConfig;
  onChartConfigChange: (config: ChartConfig | undefined) => void;
}) {
  const stdout = live?.stdout ?? output?.stdout ?? "";
  const stderr = live?.stderr ?? output?.stderr ?? "";
  const isEmpty =
    !live &&
    !!output &&
    !stdout &&
    !stderr &&
    !output.error &&
    output.text === undefined &&
    !output.table &&
    !output.images?.length;

  return (
    <div className="text-xs">
      {stdout && (
        <pre className="px-3 py-2 font-mono whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
          {stdout}
        </pre>
      )}
      {stderr && (
        <pre className="px-3 py-2 font-mono whitespace-pre-wrap break-words max-h-[200px] overflow-auto text-amber-700 dark:text-amber-400 bg-amber-500/5">
          {stderr}
        </pre>
      )}
      {output?.error && (
        <pre className="px-3 py-2 font-mono whitespace-pre-wrap break-words text-destructive bg-destructive/5">
          {output.error}
        </pre>
      )}
      {output?.text !== undefined && (
        <pre className="px-3 py-2 font-mono whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
          {output.text}
        </pre>
      )}
      {output?.table &&
        (output.table.data.length > 0 ? (
          <>
            <CellResults
              result={output.table}
              chartConfig={chartConfig}
              onChartConfigChange={onChartConfigChange}
            />
            {output.table.truncated && (
              <div className="px-3 py-1 text-muted-foreground">
                Showing first {output.table.data.length.toLocaleString()} of{" "}
                {output.table.rowCount.toLocaleString()} rows.
              </div>
            )}
          </>
        ) : (
          <div className="px-3 py-2 text-muted-foreground">
            Empty DataFrame ({output.table.columns.length} columns).
          </div>
        ))}
      {output?.images?.map((image, index) => (
        <div key={index} className="px-3 py-2 bg-white">
          <img
            src={`data:image/png;base64,${image}`}
            alt={`Figure ${index + 1}`}
            className="max-w-full h-auto"
          />
        </div>
      ))}
      {isEmpty && (
        <div className="px-3 py-2 text-muted-foreground">
          Ran successfully
          {output?.durationMs !== undefined ? ` in ${output.durationMs} ms` : ""}.
        </div>
      )}
    </div>
  );
}
