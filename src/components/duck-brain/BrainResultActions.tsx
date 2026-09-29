import React, { useCallback, useState } from "react";
import { BarChart3, FileText, Gauge, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDuckStore, type QueryResult } from "@/store";
import { runQuery } from "@/services/engine";
import { isNumericColumn } from "@/lib/chartDataTransform";
import { autoDetectChartConfig } from "@/lib/chartAutoConfig";
import { extractPlanText } from "@/lib/explainPlan";
import { missingParamsMessage, resolveQueryParams } from "@/lib/sqlParams";
import { formatSchemaForContext } from "@/lib/duckBrain/schemaFormatter";
import {
  buildExplainResultsMessages,
  buildOptimizeQueryMessages,
  buildSuggestChartMessages,
  RESULT_SAMPLE_MAX_CELL_CHARS,
  RESULT_SAMPLE_MAX_ROWS,
} from "@/lib/duckBrain/prompts/result-actions";
import {
  isSingleReadOnlyQuery,
  parseExplanation,
  parseOptimizeResponse,
  resolveChartSuggestion,
} from "@/lib/duckBrain/actionParsers";
import { describeProviderDestination, requiresDataConsent } from "@/lib/duckBrain/privacy";
import MarkdownContent from "./MarkdownContent";

type BrainAction = "explain" | "optimize" | "chart";

type ActionOutcome =
  | { kind: "explain"; summary: string }
  | { kind: "optimize"; sql: string; reasons: string; unchanged: boolean };

interface BrainResultActionsProps {
  tabId: string;
  sql: string;
  result: QueryResult;
  /** Called after a suggested chart config is applied, e.g. to show the Charts view. */
  onChartApplied?: () => void;
}

/**
 * Duck Brain actions on a finished result: explain it, optimize the query,
 * suggest a chart. Explain is the only one that sends result values, so it
 * asks for consent on every use unless the model runs in this browser.
 */
const BrainResultActions: React.FC<BrainResultActionsProps> = ({
  tabId,
  sql,
  result,
  onChartApplied,
}) => {
  const runBrainTask = useDuckStore((s) => s.runBrainTask);
  const updateTabQuery = useDuckStore((s) => s.updateTabQuery);
  const updateTabChartConfig = useDuckStore((s) => s.updateTabChartConfig);
  const aiProvider = useDuckStore((s) => s.duckBrain.aiProvider);
  const providerConfigs = useDuckStore((s) => s.duckBrain.providerConfigs);

  const [busy, setBusy] = useState<BrainAction | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  const destination = describeProviderDestination(
    aiProvider,
    aiProvider === "webllm" ? undefined : providerConfigs[aiProvider]
  );

  const runExplain = useCallback(async () => {
    setBusy("explain");
    try {
      const response = await runBrainTask(buildExplainResultsMessages(sql, result), {
        maxTokens: 700,
      });
      if (response === null) return;
      const summary = parseExplanation(response);
      if (!summary) {
        toast.error("Duck Brain returned an empty explanation");
        return;
      }
      setOutcome({ kind: "explain", summary });
    } finally {
      setBusy(null);
    }
  }, [runBrainTask, sql, result]);

  const handleExplain = useCallback(() => {
    // Never send result values silently: ask every time for network providers.
    if (requiresDataConsent(aiProvider)) {
      setConsentOpen(true);
      return;
    }
    void runExplain();
  }, [aiProvider, runExplain]);

  const handleOptimize = useCallback(async () => {
    if (!isSingleReadOnlyQuery(sql)) {
      toast.info("Optimize works on a single read-only query (SELECT / WITH / FROM).");
      return;
    }
    const { currentSession, maxResultRows, databases, tabs } = useDuckStore.getState();
    if (!currentSession) {
      toast.error("No active connection");
      return;
    }
    // EXPLAIN needs the $param values bound, the model still sees the placeholders.
    const resolved = resolveQueryParams(sql, tabs.find((t) => t.id === tabId)?.queryParams);
    if (resolved.sql === null) {
      toast.error(missingParamsMessage(resolved.missing));
      return;
    }
    setBusy("optimize");
    try {
      // Plain EXPLAIN: plans the query without running it again.
      const explained = await runQuery(
        currentSession,
        `EXPLAIN ${resolved.sql.trim().replace(/;+\s*$/, "")}`,
        "duck-brain",
        { maxRows: maxResultRows }
      );
      if (explained.error) {
        toast.error(`EXPLAIN failed: ${explained.error}`);
        return;
      }
      const plan = extractPlanText(explained.data);
      const schema = formatSchemaForContext(databases).formatted;
      const response = await runBrainTask(buildOptimizeQueryMessages(sql, plan, schema), {
        maxTokens: 1200,
      });
      if (response === null) return;
      const parsed = parseOptimizeResponse(response, sql);
      if (!parsed.ok) {
        toast.error(parsed.error);
        return;
      }
      setOutcome({
        kind: "optimize",
        sql: parsed.sql,
        reasons: parsed.reasons,
        unchanged: parsed.unchanged,
      });
    } catch (error) {
      toast.error(`Optimize failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(null);
    }
  }, [runBrainTask, sql, tabId]);

  const handleSuggestChart = useCallback(async () => {
    const numericColumns = result.columns.filter((col) => isNumericColumn(result.data, col));
    if (numericColumns.length === 0) {
      toast.info("This result has no numeric column to chart.");
      return;
    }
    setBusy("chart");
    try {
      // Column names and types only: no values leave the browser.
      const columns = result.columns.map((name, i) => ({
        name,
        type: result.columnTypes[i] ?? "unknown",
        numeric: numericColumns.includes(name),
      }));
      const response = await runBrainTask(buildSuggestChartMessages(columns), {
        maxTokens: 300,
      });
      if (response === null) return;
      const { config, fromModel } = resolveChartSuggestion(
        response,
        { columns: result.columns, numericColumns },
        autoDetectChartConfig(result)
      );
      updateTabChartConfig(tabId, config);
      onChartApplied?.();
      if (fromModel) {
        toast.success("Chart suggested by Duck Brain");
      } else {
        toast.warning("Duck Brain's chart suggestion was not usable — showing the automatic chart");
      }
    } finally {
      setBusy(null);
    }
  }, [runBrainTask, result, tabId, updateTabChartConfig, onChartApplied]);

  const handleApplyOptimized = useCallback(() => {
    if (outcome?.kind !== "optimize") return;
    updateTabQuery(tabId, outcome.sql);
    setOutcome(null);
    toast.success("Duck Brain's rewrite applied — review it and run again");
  }, [outcome, tabId, updateTabQuery]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1.5 px-2 text-xs"
            disabled={busy !== null}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {busy ? "Duck Brain is thinking…" : "Duck Brain"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={handleExplain} className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-2" />
            Explain results
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleOptimize()} className="text-xs">
            <Gauge className="h-3.5 w-3.5 mr-2" />
            Optimize query
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleSuggestChart()} className="text-xs">
            <BarChart3 className="h-3.5 w-3.5 mr-2" />
            Suggest chart
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={consentOpen} onOpenChange={setConsentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send sample rows to {destination}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Duck Brain normally sends only your schema. To explain these results it needs to
                  send actual data from this result to <strong>{destination}</strong>:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>the query text and column names and types</li>
                  <li>
                    the first {RESULT_SAMPLE_MAX_ROWS} rows (each value cut to{" "}
                    {RESULT_SAMPLE_MAX_CELL_CHARS} characters)
                  </li>
                  <li>per-column counts, null counts and numeric min / max / mean</li>
                </ul>
                <p>This is asked every time. Nothing is sent if you cancel.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runExplain()}>
              Send and explain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={outcome !== null} onOpenChange={(open) => !open && setOutcome(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {outcome?.kind === "optimize" ? "Optimized query" : "Result explanation"}
            </DialogTitle>
            <DialogDescription>
              {outcome?.kind === "optimize"
                ? outcome.unchanged
                  ? "Duck Brain thinks this query is already efficient."
                  : "Suggested by Duck Brain from the EXPLAIN plan and schema. Review before running."
                : "Written by Duck Brain from a small sample. Check anything important."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {outcome?.kind === "explain" && <MarkdownContent content={outcome.summary} />}
            {outcome?.kind === "optimize" && (
              <div className="space-y-3">
                <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs font-mono whitespace-pre-wrap">
                  {outcome.sql}
                </pre>
                {outcome.reasons && <MarkdownContent content={outcome.reasons} />}
              </div>
            )}
          </div>
          {outcome?.kind === "optimize" && !outcome.unchanged && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setOutcome(null)}>
                Close
              </Button>
              <Button onClick={handleApplyOptimized}>Apply to editor</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BrainResultActions;
