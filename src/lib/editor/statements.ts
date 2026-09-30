/** A statement's place in the document. `to` excludes the closing semicolon. */
export interface StatementRange {
  from: number;
  to: number;
  text: string;
}

/**
 * Splits SQL on semicolons that are real statement ends: not inside a string,
 * a quoted identifier, a dollar-quoted body or a comment. Empty statements
 * are dropped.
 */
export function splitStatements(sql: string): StatementRange[] {
  const ranges: StatementRange[] = [];
  let start = 0;
  let i = 0;

  const push = (end: number) => {
    const raw = sql.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) ranges.push({ from: start + lead, to: start + lead + text.length, text });
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (ch === "'" || ch === '"') {
      // A doubled quote is an escaped quote, not the end.
      i++;
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) i++;
          else break;
        }
        i++;
      }
      i++;
    } else if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? sql.length : end + tag[0].length;
      } else {
        i++;
      }
    } else if (ch === ";") {
      push(i);
      start = i + 1;
      i++;
    } else {
      i++;
    }
  }
  push(sql.length);
  return ranges;
}

/**
 * The statement the cursor belongs to. A cursor in the gap after a statement,
 * including right behind its semicolon, belongs to the statement before it,
 * which is where people leave the cursor after typing a query.
 */
export function statementAt(sql: string, position: number): StatementRange | null {
  const ranges = splitStatements(sql);
  if (ranges.length === 0) return null;
  let current = ranges[0];
  for (const range of ranges) {
    if (range.from > position) break;
    current = range;
  }
  return current;
}
