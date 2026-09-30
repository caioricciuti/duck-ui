/** Where an engine error points, as offsets into the SQL that was run. */
export interface ErrorLocation {
  from: number;
  to: number;
}

const LINE_MARKER = /^LINE (\d+): (.*)$/;
const ELLIPSIS = "...";

/**
 * Finds the position DuckDB points at. Its messages carry an excerpt and a
 * caret line:
 *
 *     Parser Error: syntax error at or near "FORM"
 *
 *     LINE 1: select * FORM t
 *                      ^
 *
 * Long lines are shortened with "..." on either side, so the caret column is
 * measured inside the excerpt and the excerpt is then located in the real
 * line. Returns null when the message has no position or it cannot be placed
 * with confidence: a wrong underline is worse than none.
 */
export function locateError(message: string, sql: string): ErrorLocation | null {
  const lines = message.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const marker = LINE_MARKER.exec(lines[i]);
    if (!marker) continue;
    const caret = lines[i + 1].indexOf("^");
    if (caret === -1) continue;

    const lineNumber = Number(marker[1]);
    const prefixLength = lines[i].length - marker[2].length;
    let excerpt = marker[2];
    let column = caret - prefixLength;
    if (column < 0) return null;

    const sqlLines = sql.split("\n");
    const line = sqlLines[lineNumber - 1];
    if (line === undefined) return null;

    let offsetInLine: number;
    if (excerpt.startsWith(ELLIPSIS) || excerpt.endsWith(ELLIPSIS)) {
      if (excerpt.startsWith(ELLIPSIS)) {
        excerpt = excerpt.slice(ELLIPSIS.length);
        column -= ELLIPSIS.length;
      }
      if (excerpt.endsWith(ELLIPSIS)) excerpt = excerpt.slice(0, -ELLIPSIS.length);
      const found = line.indexOf(excerpt);
      // Absent or ambiguous: the excerpt cannot be placed.
      if (found === -1 || line.indexOf(excerpt, found + 1) !== -1 || column < 0) return null;
      offsetInLine = found + column;
    } else {
      if (line.trimEnd() !== excerpt.trimEnd()) return null;
      offsetInLine = column;
    }
    if (offsetInLine > line.length) return null;

    let from = offsetInLine;
    for (let l = 0; l < lineNumber - 1; l++) from += sqlLines[l].length + 1;

    // Underline the token at the caret, or one character when it sits on
    // whitespace or at the end of the line.
    const rest = sql.slice(from);
    const token = /^(?:[\w$]+|"[^"]*"|'[^']*'|\S)/.exec(rest);
    const length = token ? token[0].length : 1;
    return { from, to: Math.min(sql.length, from + Math.max(1, length)) };
  }
  return null;
}
