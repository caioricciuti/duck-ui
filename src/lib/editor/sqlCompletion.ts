import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { SQLNamespace } from "@codemirror/lang-sql";
import { useDuckStore } from "@/store";
import { runQuery } from "@/services/engine";
import { sqlEscapeString } from "@/lib/sqlSanitize";
import type { DatabaseInfo } from "@/store/types";

/** Enough context for DuckDB to complete a statement, without sending a whole script. */
const MAX_CONTEXT_CHARS = 2000;
const MAX_SUGGESTIONS = 40;

interface Suggestion {
  suggestion: unknown;
  suggestion_start: unknown;
}

/**
 * Runs `sql_auto_complete` on the engine that executes the queries.
 *
 * In-tab engines answer on the shared connection, which is not queued behind
 * a running statement. Remote engines answer through their session, so
 * completion works there too when the server has the autocomplete extension.
 */
async function askEngine(text: string, signal: AbortSignal): Promise<Suggestion[]> {
  const sql = `SELECT suggestion, suggestion_start FROM sql_auto_complete('${sqlEscapeString(text)}') LIMIT ${MAX_SUGGESTIONS}`;
  const { connection, currentSession } = useDuckStore.getState();

  if (connection && !currentSession?.capabilities.remote) {
    const table = await connection.query(sql);
    return table.toArray().map((row: unknown) => row as Suggestion);
  }
  if (!currentSession) return [];
  const result = await runQuery(currentSession, sql, "autocomplete", {
    maxRows: MAX_SUGGESTIONS,
    signal,
  });
  return result.error ? [] : (result.data as unknown as Suggestion[]);
}

/** Start of the statement the cursor is in: the text after the previous `;`. */
function statementStart(doc: string, pos: number): number {
  const floor = Math.max(0, pos - MAX_CONTEXT_CHARS);
  const previous = doc.lastIndexOf(";", pos - 1);
  return Math.max(floor, previous + 1);
}

export async function duckdbCompletionSource(
  context: CompletionContext
): Promise<CompletionResult | null> {
  const word = context.matchBefore(/[\w$]*/);
  const previous = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos);
  const afterTrigger = /[\s.(,]/.test(previous);
  if (!context.explicit && !afterTrigger && (!word || word.from === word.to)) return null;

  const doc = context.state.doc.toString();
  const start = statementStart(doc, context.pos);
  const text = doc.slice(start, context.pos);
  if (!text.trim()) return null;

  const controller = new AbortController();
  context.addEventListener("abort", () => controller.abort());

  let rows: Suggestion[];
  try {
    rows = await askEngine(text, controller.signal);
  } catch {
    // The engine may lack the extension, or the statement may be unparseable
    // so far. Schema and keyword completion still apply.
    return null;
  }
  if (context.aborted || rows.length === 0) return null;

  const offset = Number(rows[0].suggestion_start);
  const from = Number.isFinite(offset) ? start + offset : (word?.from ?? context.pos);
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const row of rows) {
    const label = String(row.suggestion).trimEnd();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    options.push({ label, type: "property", boost: 1 });
  }

  return { from: Math.min(from, context.pos), options, validFor: /^[\w$]*$/ };
}

/** Catalog in the shape `@codemirror/lang-sql` completes from. */
export function toSqlSchema(databases: DatabaseInfo[]): SQLNamespace {
  const schema: Record<string, SQLNamespace> = {};
  for (const database of databases) {
    const schemas: Record<string, Record<string, string[]>> = {};
    for (const table of database.tables) {
      const columns = table.columns.map((column) => column.name);
      (schemas[table.schema || "main"] ??= {})[table.name] = columns;
      // Unqualified names resolve too, which is how most queries are written.
      if (!(table.name in schema)) schema[table.name] = columns;
    }
    schema[database.name] = schemas;
  }
  return schema;
}
