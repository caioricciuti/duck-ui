import { sqlEscapeString } from "@/lib/sqlSanitize";

/**
 * Named query parameters for SQL tabs and notebooks: `$name` and `${name}`.
 *
 * Detection walks the SQL with a small tokenizer rather than a regex, because
 * a `$name` inside a string literal, a quoted identifier, a comment or a
 * dollar-quoted body is text, not a placeholder — and substituting into those
 * would silently change what a query means.
 *
 * Deliberately NOT placeholders, so existing queries keep working:
 *   $1, $2        positional prepared-statement parameters
 *   $$…$$         dollar-quoted strings
 *   $tag$…$tag$   tagged dollar-quoted strings
 *   a$b           `$` inside an identifier
 *
 * Substitution renders values as SQL literals, never raw text: numbers inline,
 * everything else as a single-quoted string with `'` doubled.
 */

export interface SqlPlaceholder {
  name: string;
  /** Offset of the `$`. */
  start: number;
  /** Offset just past the placeholder (past `}` for the braced form). */
  end: number;
}

/** Per-tab parameter state. Persisted with the tab. */
export interface QueryParamsState {
  /** Raw input text per parameter name. */
  values: Record<string, string>;
  /** Parameters kept as text even when the value looks numeric (e.g. "42" codes). */
  forceText?: string[];
  /** Placeholder substitution switched off for this tab. */
  disabled?: boolean;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;

const readIdentifier = (sql: string, from: number): number => {
  let i = from;
  if (i >= sql.length || !IDENT_START.test(sql[i])) return from;
  i++;
  while (i < sql.length && IDENT_CHAR.test(sql[i])) i++;
  return i;
};

/** Index just past a quoted run starting at `from` (the opening quote). */
const skipQuoted = (
  sql: string,
  from: number,
  quote: string,
  backslashEscapes: boolean
): number => {
  let i = from + 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (backslashEscapes && ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      // Doubled quote is an escaped quote, not the end.
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return sql.length;
};

/** Index just past a (possibly nested) block comment starting at `from`. */
const skipBlockComment = (sql: string, from: number): number => {
  let depth = 0;
  let i = from;
  while (i < sql.length) {
    if (sql[i] === "/" && sql[i + 1] === "*") {
      depth++;
      i += 2;
    } else if (sql[i] === "*" && sql[i + 1] === "/") {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return sql.length;
};

/** Finds every named placeholder outside literals, identifiers and comments. */
export function findPlaceholders(sql: string): SqlPlaceholder[] {
  const found: SqlPlaceholder[] = [];
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      const newline = sql.indexOf("\n", i + 2);
      i = newline === -1 ? sql.length : newline + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i = skipBlockComment(sql, i);
      continue;
    }
    if (ch === "'") {
      // E'…' strings honour backslash escapes; plain ones only ''.
      const prev = sql[i - 1];
      const isEscapeString = (prev === "E" || prev === "e") && !IDENT_CHAR.test(sql[i - 2] ?? "");
      i = skipQuoted(sql, i, "'", isEscapeString);
      continue;
    }
    if (ch === '"') {
      i = skipQuoted(sql, i, '"', false);
      continue;
    }
    if (ch === "$") {
      const prev = sql[i - 1] ?? "";
      // `$` continuing an identifier or a previous `$` run is not ours.
      if (IDENT_CHAR.test(prev) || prev === "$") {
        i++;
        continue;
      }

      // Dollar quoting: $$ or $tag$, only when a matching close exists.
      const tagEnd = readIdentifier(sql, i + 1);
      if (sql[tagEnd] === "$") {
        const delimiter = sql.slice(i, tagEnd + 1);
        const close = sql.indexOf(delimiter, tagEnd + 1);
        if (close !== -1) {
          i = close + delimiter.length;
          continue;
        }
        if (delimiter === "$$") {
          // Unterminated $$: everything after is string body.
          i = sql.length;
          continue;
        }
      }

      // ${name}
      if (next === "{") {
        const nameEnd = readIdentifier(sql, i + 2);
        if (nameEnd > i + 2 && sql[nameEnd] === "}") {
          found.push({ name: sql.slice(i + 2, nameEnd), start: i, end: nameEnd + 1 });
          i = nameEnd + 1;
          continue;
        }
        i++;
        continue;
      }

      // $name ($1-style positional parameters fail IDENT_START and fall through)
      if (tagEnd > i + 1) {
        found.push({ name: sql.slice(i + 1, tagEnd), start: i, end: tagEnd });
        i = tagEnd;
        continue;
      }
    }
    i++;
  }

  return found;
}

/** Distinct placeholder names, in order of first appearance. */
export function listParameterNames(sql: string): string[] {
  return [...new Set(findPlaceholders(sql).map((placeholder) => placeholder.name))];
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Whether a raw value should be inlined as a number.
 *
 * Leading zeros ("007", zip codes, account numbers) stay text: as a number
 * they would silently lose the zeros.
 */
export function looksNumeric(raw: string): boolean {
  const value = raw.trim();
  if (!NUMBER.test(value)) return false;
  const digits = value.replace(/^[+-]/, "");
  if (/^0\d/.test(digits)) return false;
  return Number.isFinite(Number(value));
}

/** Renders a raw input value as a SQL literal. */
export function toParamLiteral(raw: string, forceText = false): string {
  if (!forceText && looksNumeric(raw)) {
    const value = raw.trim().replace(/^\+/, "");
    // Parenthesised so `x-$n` can't become `x--5`, a line comment.
    return value.startsWith("-") ? `(${value})` : value;
  }
  return `'${sqlEscapeString(raw)}'`;
}

export type ResolveResult = { sql: string; missing: [] } | { sql: null; missing: string[] };

/**
 * Substitutes placeholders from per-tab state.
 *
 * An empty or absent value is reported as missing rather than guessed at:
 * running with `''` or NULL would return a plausible-looking wrong answer.
 */
export function resolveQueryParams(sql: string, state?: QueryParamsState): ResolveResult {
  if (state?.disabled) return { sql, missing: [] };
  const placeholders = findPlaceholders(sql);
  if (placeholders.length === 0) return { sql, missing: [] };

  const values = state?.values ?? {};
  const forceText = new Set(state?.forceText ?? []);
  const missing = [
    ...new Set(
      placeholders
        .map((placeholder) => placeholder.name)
        .filter((name) => (values[name] ?? "") === "")
    ),
  ];
  if (missing.length > 0) return { sql: null, missing };

  let out = "";
  let cursor = 0;
  for (const placeholder of placeholders) {
    out += sql.slice(cursor, placeholder.start);
    out += toParamLiteral(values[placeholder.name], forceText.has(placeholder.name));
    cursor = placeholder.end;
  }
  return { sql: out + sql.slice(cursor), missing: [] };
}

/** Message for a run blocked on unset parameters. */
export function missingParamsMessage(missing: string[]): string {
  const names = missing.map((name) => `$${name}`).join(", ");
  return `Set a value for ${names} in the parameter bar before running (or turn parameters off for this tab).`;
}
