import { useMemo, useState } from "react";
import { useDuckStore, type QueryResult, type ResultPin } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DuckUiTable from "@/components/table/DuckUItable";
import { ArrowLeftRight, GitCompare, Scissors, Trash2 } from "lucide-react";
import {
  createResultSnapshot,
  diffResults,
  isIdentical,
  PIN_ROW_LIMIT,
  ResultDiffError,
  type ChangedRow,
  type ResultDiff,
  type ResultSnapshot,
} from "@/lib/resultDiff";
import { formatTimestampUTC } from "@/lib/datetime";

/** Sentinel select value for the tab's live result. */
const CURRENT = "__current__";
/** Changed rows are rendered as a plain table, so bound how many. */
const CHANGED_DISPLAY_LIMIT = 500;

interface ResultCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tab's current result, offered as a side next to the pins. */
  currentResult?: QueryResult | null;
}

const oneLine = (sql: string, max = 60): string => {
  const flat = sql.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || "(empty query)";
};

const pinLabel = (pin: ResultPin): string =>
  `${pin.pinnedAt.toLocaleTimeString()} · ${oneLine(pin.query)}`;

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return formatTimestampUTC(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const SidePicker = ({
  label,
  value,
  onChange,
  pins,
  hasCurrent,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  pins: ResultPin[];
  hasCurrent: boolean;
}) => (
  <div className="flex-1 min-w-0 space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Pick a result" />
      </SelectTrigger>
      <SelectContent>
        {hasCurrent && (
          <SelectItem value={CURRENT} className="text-xs">
            Current result
          </SelectItem>
        )}
        {[...pins].reverse().map((pin) => (
          <SelectItem key={pin.id} value={pin.id} className="text-xs">
            {pinLabel(pin)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const ChangedRowsTable = ({ diff }: { diff: ResultDiff }) => {
  const { keyColumns, comparedColumns, changed } = diff.rows;
  // Key columns, then only the columns that changed somewhere — a wide result
  // with one edited cell should not scroll sideways to find it.
  const touched = new Set(changed.flatMap((row) => row.changedColumns));
  const columns = [...keyColumns, ...comparedColumns.filter((c) => touched.has(c))];
  const shown: ChangedRow[] = changed.slice(0, CHANGED_DISPLAY_LIMIT);

  if (changed.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">No changed rows.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      {changed.length > shown.length && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          Showing the first {shown.length.toLocaleString()} of {changed.length.toLocaleString()}{" "}
          changed rows.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c} className="h-8 whitespace-nowrap text-xs">
                  {c}
                  {keyColumns.includes(c) && (
                    <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
                      key
                    </Badge>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => {
                  const isChanged = row.changedColumns.includes(c);
                  return (
                    <TableCell
                      key={c}
                      className={
                        isChanged
                          ? "bg-amber-500/15 py-1 font-mono align-top"
                          : "py-1 font-mono align-top"
                      }
                    >
                      {isChanged ? (
                        <div className="flex flex-col">
                          <span className="text-red-600 line-through dark:text-red-400">
                            {formatCell(row.before[c])}
                          </span>
                          <span className="text-green-700 dark:text-green-400">
                            {formatCell(row.after[c])}
                          </span>
                        </div>
                      ) : (
                        formatCell(row.after[c])
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const SchemaChanges = ({ diff }: { diff: ResultDiff }) => {
  const { added, removed, typeChanged, reordered } = diff.schema;
  if (added.length + removed.length + typeChanged.length === 0) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Same columns and types{reordered ? ", in a different order" : ""}.
      </p>
    );
  }
  return (
    <div className="space-y-1 p-2 font-mono text-xs">
      {added.map((c) => (
        <div key={`a-${c.name}`} className="text-green-700 dark:text-green-400">
          + {c.name} {c.type}
        </div>
      ))}
      {removed.map((c) => (
        <div key={`r-${c.name}`} className="text-red-600 dark:text-red-400">
          − {c.name} {c.type}
        </div>
      ))}
      {typeChanged.map((c) => (
        <div key={`t-${c.name}`} className="text-amber-600 dark:text-amber-400">
          ~ {c.name}: {c.from || "?"} → {c.to || "?"}
        </div>
      ))}
      {reordered && <div className="text-muted-foreground">Column order also differs.</div>}
    </div>
  );
};

/**
 * Compare two pinned results, or a pin against the tab's current result.
 * The diff itself lives in `lib/resultDiff`; this only picks the sides and
 * renders what comes back.
 */
export default function ResultCompareDialog({
  open,
  onOpenChange,
  currentResult,
}: ResultCompareDialogProps) {
  const pins = useDuckStore((s) => s.resultPins);
  const removeResultPin = useDuckStore((s) => s.removeResultPin);

  const hasCurrent = !!currentResult && !currentResult.error;
  // Default sides: the newest pin against the current result, or the two
  // newest pins when there is no current result. The parent mounts this only
  // while open, so these initialise afresh each time it opens.
  const [leftId, setLeftId] = useState<string>(
    () => (hasCurrent ? pins[pins.length - 1]?.id : pins[pins.length - 2]?.id) ?? ""
  );
  const [rightId, setRightId] = useState<string>(() =>
    hasCurrent ? CURRENT : (pins[pins.length - 1]?.id ?? "")
  );
  const [keyColumns, setKeyColumns] = useState<string[]>([]);
  const [view, setView] = useState<string>("changed");

  const currentSnapshot = useMemo(
    () => (hasCurrent && currentResult ? createResultSnapshot(currentResult) : null),
    [hasCurrent, currentResult]
  );

  const resolve = (id: string): ResultSnapshot | null => {
    if (id === CURRENT) return currentSnapshot;
    return pins.find((p) => p.id === id)?.snapshot ?? null;
  };
  const left = resolve(leftId);
  const right = resolve(rightId);

  const commonColumns = useMemo(
    () => (left && right ? right.columns.filter((c) => left.columns.includes(c)) : []),
    [left, right]
  );
  const activeKeys = useMemo(
    () => keyColumns.filter((c) => commonColumns.includes(c)),
    [keyColumns, commonColumns]
  );

  const outcome = useMemo((): { diff: ResultDiff } | { error: string } | null => {
    if (!left || !right) return null;
    try {
      return { diff: diffResults(left, right, { keyColumns: activeKeys }) };
    } catch (error) {
      if (error instanceof ResultDiffError) return { error: error.message };
      throw error;
    }
  }, [left, right, activeKeys]);

  const diff = outcome && "diff" in outcome ? outcome.diff : null;
  // "Changed" only exists with a key; fall back rather than show nothing.
  const activeView = view === "changed" && diff?.rows.mode !== "keyed" ? "added" : view;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-6xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Compare results
          </DialogTitle>
          <DialogDescription>
            Pin results from any SQL tab, then compare two of them — or a pin against the current
            result. Pins last for this session and keep up to {PIN_ROW_LIMIT.toLocaleString()} rows.
          </DialogDescription>
        </DialogHeader>

        {pins.length === 0 || (pins.length < 2 && !hasCurrent) ? (
          <p className="text-sm text-muted-foreground">
            {pins.length === 0
              ? "Nothing pinned yet. Use “Pin result” under a query result first."
              : "Pin one more result, or run a query, to have two sides to compare."}
          </p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <SidePicker
                label="Before"
                value={leftId}
                onChange={setLeftId}
                pins={pins}
                hasCurrent={hasCurrent}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Swap sides"
                onClick={() => {
                  setLeftId(rightId);
                  setRightId(leftId);
                }}
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
              <SidePicker
                label="After"
                value={rightId}
                onChange={setRightId}
                pins={pins}
                hasCurrent={hasCurrent}
              />
              <div className="flex-1 min-w-0 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Key column(s) — empty compares whole rows
                </Label>
                <MultiSelect
                  options={commonColumns.map((c) => ({ label: c, value: c }))}
                  selected={activeKeys}
                  onChange={setKeyColumns}
                  placeholder="No key"
                  className="min-h-8 text-xs"
                />
              </div>
            </div>

            {outcome && "error" in outcome && (
              <p className="text-xs text-destructive">{outcome.error}</p>
            )}

            {diff && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">
                    Rows {diff.rowCount.left.toLocaleString()} →{" "}
                    {diff.rowCount.right.toLocaleString()} ({diff.rowCount.delta >= 0 ? "+" : ""}
                    {diff.rowCount.delta.toLocaleString()})
                  </Badge>
                  <Badge variant="outline" className="text-green-700 dark:text-green-400">
                    +{diff.rows.added.length.toLocaleString()} added
                  </Badge>
                  <Badge variant="outline" className="text-red-600 dark:text-red-400">
                    −{diff.rows.removed.length.toLocaleString()} removed
                  </Badge>
                  {diff.rows.mode === "keyed" && (
                    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                      ~{diff.rows.changed.length.toLocaleString()} changed
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {diff.rows.unchangedCount.toLocaleString()} unchanged
                  </Badge>
                  {isIdentical(diff) && <Badge>Identical</Badge>}
                </div>

                {diff.partial && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                    <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span>
                      At least one side holds only part of its result (pins keep the first{" "}
                      {PIN_ROW_LIMIT.toLocaleString()} rows, and the engine row limit may have
                      applied). Row-level differences cover the captured rows only.
                    </span>
                  </div>
                )}
                {(diff.rows.duplicateKeys.left > 0 || diff.rows.duplicateKeys.right > 0) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    The key is not unique ({diff.rows.duplicateKeys.left} duplicate(s) before,{" "}
                    {diff.rows.duplicateKeys.right} after); duplicates are paired in row order.
                  </p>
                )}

                <Tabs
                  value={activeView}
                  onValueChange={setView}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <TabsList className="h-8 w-fit">
                    {diff.rows.mode === "keyed" && (
                      <TabsTrigger value="changed" className="h-6 text-xs">
                        Changed ({diff.rows.changed.length.toLocaleString()})
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="added" className="h-6 text-xs">
                      Added ({diff.rows.added.length.toLocaleString()})
                    </TabsTrigger>
                    <TabsTrigger value="removed" className="h-6 text-xs">
                      Removed ({diff.rows.removed.length.toLocaleString()})
                    </TabsTrigger>
                    <TabsTrigger value="schema" className="h-6 text-xs">
                      Schema (
                      {diff.schema.added.length +
                        diff.schema.removed.length +
                        diff.schema.typeChanged.length}
                      )
                    </TabsTrigger>
                  </TabsList>
                  {diff.rows.mode === "keyed" && (
                    <TabsContent value="changed" className="mt-2 min-h-0 flex-1">
                      <ChangedRowsTable diff={diff} />
                    </TabsContent>
                  )}
                  <TabsContent value="added" className="mt-2 min-h-0 flex-1">
                    {diff.rows.added.length > 0 ? (
                      <div className="h-full">
                        <DuckUiTable data={diff.rows.added} />
                      </div>
                    ) : (
                      <p className="p-4 text-xs text-muted-foreground">No added rows.</p>
                    )}
                  </TabsContent>
                  <TabsContent value="removed" className="mt-2 min-h-0 flex-1">
                    {diff.rows.removed.length > 0 ? (
                      <div className="h-full">
                        <DuckUiTable data={diff.rows.removed} />
                      </div>
                    ) : (
                      <p className="p-4 text-xs text-muted-foreground">No removed rows.</p>
                    )}
                  </TabsContent>
                  <TabsContent value="schema" className="mt-2 min-h-0 flex-1 overflow-auto">
                    <SchemaChanges diff={diff} />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )}

        {pins.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Pinned results ({pins.length})
            </summary>
            <ul className="mt-1 max-h-32 space-y-1 overflow-auto">
              {[...pins].reverse().map((pin) => (
                <li key={pin.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate" title={pin.query}>
                    {pinLabel(pin)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {pin.snapshot.rows.length.toLocaleString()} rows
                    {pin.snapshot.truncated ? " (partial)" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    title="Remove pin"
                    onClick={() => removeResultPin(pin.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
