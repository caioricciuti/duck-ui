import type { ChartConfig, ChartType, SortOrder } from "@/store/types";
import { extractSQLFromResponse } from "./sqlParser";

/**
 * Parsers and validators for the result-level Duck Brain actions. Model
 * output is untrusted: everything here fails closed and returns only values
 * that were checked against known chart types, known columns, and a
 * read-only SQL shape.
 */

const MAX_RESPONSE_CHARS = 50_000;
const MAX_EXPLANATION_CHARS = 4_000;
const MAX_REASONS_CHARS = 2_000;
const MAX_TITLE_CHARS = 80;
const MAX_Y_COLUMNS = 8;
const MAX_LIMIT = 1_000;

// ── Explain results ─────────────────────────────────────────────────────────

/** Bounds the summary and drops control characters; Markdown is rendered without raw HTML. */
export function parseExplanation(text: string): string | null {
  const cleaned = stripControlChars(text.slice(0, MAX_RESPONSE_CHARS), true).trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_EXPLANATION_CHARS
    ? `${cleaned.slice(0, MAX_EXPLANATION_CHARS - 1)}…`
    : cleaned;
}

// ── SQL shape checks ────────────────────────────────────────────────────────

interface StrippedSql {
  /** SQL with comments removed and every literal / quoted identifier blanked. */
  code: string;
  /** Contents of the single-quoted and dollar-quoted string literals. */
  strings: string[];
}

/** Returns null for unterminated quotes or comments. */
export function stripSqlLiterals(sql: string): StrippedSql | null {
  let code = "";
  const strings: string[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      code += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return null;
      i = end + 2;
      code += " ";
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let value = "";
      for (;;) {
        if (j >= sql.length) return null;
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            value += ch;
            j += 2;
            continue;
          }
          break;
        }
        value += sql[j];
        j++;
      }
      if (ch === "'") strings.push(value);
      code += ch === "'" ? "''" : '""';
      i = j + 1;
      continue;
    }
    if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        if (end === -1) return null;
        strings.push(sql.slice(i + tag[0].length, end));
        code += "''";
        i = end + tag[0].length;
        continue;
      }
    }
    code += ch;
    i++;
  }
  return { code, strings };
}

const READ_ONLY_STARTS = new Set(["SELECT", "WITH", "FROM", "VALUES", "TABLE", "PIVOT", "UNPIVOT"]);

const WRITE_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|ATTACH|DETACH|COPY|INSTALL|LOAD|PRAGMA|SET|RESET|EXPORT|IMPORT|CALL|TRUNCATE|VACUUM|CHECKPOINT|USE|MERGE|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK)\b/i;

/** True for exactly one statement that reads data and changes nothing. */
export function isSingleReadOnlyQuery(sql: string): boolean {
  const stripped = stripSqlLiterals(sql);
  if (!stripped) return false;
  const code = stripped.code.trim().replace(/[;\s]+$/, "");
  if (!code || code.includes(";")) return false;
  const first = /^[(\s]*([A-Za-z]+)/.exec(code)?.[1]?.toUpperCase();
  if (!first || !READ_ONLY_STARTS.has(first)) return false;
  return !WRITE_KEYWORDS.test(code);
}

const normalizeSql = (sql: string): string =>
  sql
    .trim()
    .replace(/[;\s]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

// ── Optimize query ──────────────────────────────────────────────────────────

export type OptimizeParseResult =
  { ok: true; sql: string; reasons: string; unchanged: boolean } | { ok: false; error: string };

const FENCED_BLOCK = /```([A-Za-z]*)[^\n`]*\n?([\s\S]*?)```/g;

function pickSqlBlock(text: string): string | null {
  const blocks = [...text.matchAll(FENCED_BLOCK)].map((m) => ({
    lang: m[1].toLowerCase(),
    body: m[2].trim(),
  }));
  const sqlBlock =
    blocks.find((b) => b.lang === "sql" && b.body) ??
    blocks.find((b) => /^[(\s]*(SELECT|WITH|FROM)\b/i.test(b.body));
  return sqlBlock?.body ?? null;
}

export function parseOptimizeResponse(text: string, originalSql: string): OptimizeParseResult {
  const bounded = text.slice(0, MAX_RESPONSE_CHARS);
  let sql = pickSqlBlock(bounded);
  let reasons = "";

  if (sql) {
    reasons = bounded.replace(FENCED_BLOCK, "").trim();
  } else if (/^\s*(SELECT|WITH|FROM)\b/i.test(bounded)) {
    // The model ignored the fence but answered with bare SQL.
    sql = extractSQLFromResponse(bounded).sql;
  }

  if (!sql) {
    return { ok: false, error: "Duck Brain did not return a SQL query." };
  }
  if (!isSingleReadOnlyQuery(sql)) {
    return {
      ok: false,
      error: "Duck Brain's suggestion was not a single read-only query, so it was discarded.",
    };
  }

  // A rewrite has no reason to reach a new remote location. Refuse any URL
  // literal the original query did not already contain.
  const originalStrings = new Set(stripSqlLiterals(originalSql)?.strings ?? []);
  const introducesUrl = (stripSqlLiterals(sql)?.strings ?? []).some(
    (s) => s.includes("://") && !originalStrings.has(s)
  );
  if (introducesUrl) {
    return {
      ok: false,
      error: "Duck Brain's suggestion referenced a new remote location, so it was discarded.",
    };
  }

  reasons = stripControlChars(reasons, true);
  if (reasons.length > MAX_REASONS_CHARS) reasons = `${reasons.slice(0, MAX_REASONS_CHARS - 1)}…`;

  return {
    ok: true,
    sql: sql.trim(),
    reasons,
    unchanged: normalizeSql(sql) === normalizeSql(originalSql),
  };
}

// ── Suggest chart ───────────────────────────────────────────────────────────

/** Chart types ChartVisualizationPro actually renders. */
export const SUPPORTED_CHART_TYPES = [
  "bar",
  "grouped_bar",
  "stacked_bar",
  "line",
  "area",
  "stacked_area",
  "pie",
  "donut",
  "scatter",
] as const satisfies readonly ChartType[];

export type SupportedChartType = (typeof SUPPORTED_CHART_TYPES)[number];

const SORT_ORDERS: readonly SortOrder[] = ["asc", "desc", "none"];

export interface ChartSuggestion {
  type: SupportedChartType;
  xAxis: string;
  yColumns: string[];
  title?: string;
  smooth?: boolean;
  showValues?: boolean;
  sortOrder?: SortOrder;
  limit?: number;
}

export interface ChartColumnContext {
  columns: string[];
  numericColumns: string[];
}

const own = (obj: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;

function extractJsonObject(text: string): Record<string, unknown> | null {
  const bounded = text.slice(0, MAX_RESPONSE_CHARS);
  const fenced = [...bounded.matchAll(FENCED_BLOCK)].map((m) => m[2].trim());
  const candidates = [...fenced, bounded.trim()];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function readYColumns(obj: Record<string, unknown>): unknown[] | null {
  const yAxis = own(obj, "yAxis");
  if (typeof yAxis === "string") return [yAxis];
  if (Array.isArray(yAxis)) return yAxis;
  const series = own(obj, "series");
  if (Array.isArray(series)) {
    return series.map((s) =>
      s && typeof s === "object" && !Array.isArray(s)
        ? own(s as Record<string, unknown>, "column")
        : s
    );
  }
  return null;
}

/**
 * Parses and strictly validates a model's chart suggestion. Returns null
 * unless the chart type is supported and every referenced column exists
 * (y columns must also be numeric and distinct from the x-axis). Invalid
 * optional fields are dropped.
 */
export function parseChartSuggestion(
  text: string,
  ctx: ChartColumnContext
): ChartSuggestion | null {
  const obj = extractJsonObject(text);
  if (!obj) return null;

  const type = own(obj, "type");
  if (typeof type !== "string" || !(SUPPORTED_CHART_TYPES as readonly string[]).includes(type)) {
    return null;
  }

  const xAxis = own(obj, "xAxis");
  if (typeof xAxis !== "string" || !ctx.columns.includes(xAxis)) return null;

  const rawY = readYColumns(obj);
  if (!rawY || rawY.length === 0 || rawY.length > MAX_Y_COLUMNS) return null;
  const yColumns: string[] = [];
  for (const y of rawY) {
    if (typeof y !== "string" || y === xAxis) return null;
    if (!ctx.columns.includes(y) || !ctx.numericColumns.includes(y)) return null;
    if (!yColumns.includes(y)) yColumns.push(y);
  }
  if ((type === "pie" || type === "donut") && yColumns.length !== 1) return null;

  const suggestion: ChartSuggestion = {
    type: type as SupportedChartType,
    xAxis,
    yColumns,
  };

  const title = own(obj, "title");
  if (typeof title === "string") {
    const clean = stripControlChars(title, false).trim().slice(0, MAX_TITLE_CHARS);
    if (clean) suggestion.title = clean;
  }
  const smooth = own(obj, "smooth");
  if (typeof smooth === "boolean") suggestion.smooth = smooth;
  const showValues = own(obj, "showValues");
  if (typeof showValues === "boolean") suggestion.showValues = showValues;
  const sortOrder = own(obj, "sortOrder");
  if (typeof sortOrder === "string" && (SORT_ORDERS as readonly string[]).includes(sortOrder)) {
    suggestion.sortOrder = sortOrder as SortOrder;
  }
  const limit = own(obj, "limit");
  if (typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT) {
    suggestion.limit = limit;
  }

  return suggestion;
}

/** Overlays a validated suggestion on a base config (the auto-detected one). */
export function applyChartSuggestion(base: ChartConfig, s: ChartSuggestion): ChartConfig {
  const colors = base.colors?.length ? base.colors : undefined;
  const config: ChartConfig = {
    ...base,
    type: s.type,
    xAxis: s.xAxis,
    yAxis: s.yColumns.length === 1 ? s.yColumns[0] : undefined,
    series:
      s.yColumns.length > 1
        ? s.yColumns.map((column, i) => ({
            column,
            label: column,
            color: colors ? colors[i % colors.length] : undefined,
          }))
        : undefined,
  };
  if (s.title !== undefined) config.title = s.title;
  if (s.smooth !== undefined) config.smooth = s.smooth;
  if (s.showValues !== undefined) config.showValues = s.showValues;
  if (s.sortOrder !== undefined || s.limit !== undefined) {
    config.transform = {
      ...base.transform,
      ...(s.sortOrder !== undefined ? { sortBy: s.yColumns[0], sortOrder: s.sortOrder } : {}),
      ...(s.limit !== undefined ? { limit: s.limit } : {}),
    };
  }
  return config;
}

/** The chart to apply: the model's suggestion if valid, otherwise the fallback. */
export function resolveChartSuggestion(
  text: string,
  ctx: ChartColumnContext,
  fallback: ChartConfig
): { config: ChartConfig; fromModel: boolean } {
  const suggestion = parseChartSuggestion(text, ctx);
  return suggestion
    ? { config: applyChartSuggestion(fallback, suggestion), fromModel: true }
    : { config: fallback, fromModel: false };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function stripControlChars(text: string, keepNewlines: boolean): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isControl = code < 0x20 || code === 0x7f;
    if (!isControl) out += ch;
    else if (keepNewlines && (ch === "\n" || ch === "\t" || ch === "\r")) out += ch;
    else if (!keepNewlines) out += " ";
  }
  return out;
}
