import type { QueryResult } from "@/store";

/**
 * Framework-free text helpers for the Duck Brain chat UI: mention splitting,
 * code block stripping, the streaming markdown boundary, and the result
 * shape the virtual table expects.
 */

export interface MentionPart {
  type: "text" | "mention";
  value: string;
  /** `table.column` mentions point at a column, bare names at a table. */
  isColumn: boolean;
}

/** Split text into plain runs and `@table` / `@table.column` mentions. */
export function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = [];
  const mentionRegex = /@([\w.]+)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(mentionRegex)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start), isColumn: false });
    }
    parts.push({ type: "mention", value: match[1], isColumn: match[1].includes(".") });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex), isColumn: false });
  }
  return parts;
}

/**
 * Remove every fenced code block from a message whose SQL is rendered
 * separately as an interactive block. Two passes catch both variations:
 * fences with a language and a newline, then anything that is left.
 */
export function stripCodeBlocks(content: string): string {
  return content
    .replace(/```\w*\n[\s\S]*?```/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FENCE_RE = /^(```|~~~)/;
const LIST_ITEM_RE = /^([-*+]|\d+[.)])\s/;

/**
 * Offset up to which streamed markdown will not change its rendering when
 * more text arrives, or 0 when nothing is settled yet.
 *
 * The text before the offset can be parsed once and kept. A cut is only made
 * outside code fences, either right after a closing fence or where a new
 * top-level block starts after a blank line. Indented lines and list items
 * are never a cut point: they may continue the list above them.
 */
export function findStableBoundary(text: string): number {
  let boundary = 0;
  let inFence = false;
  let previousBlank = false;
  let pos = 0;

  while (pos < text.length) {
    const newline = text.indexOf("\n", pos);
    // The last line is still being written, it is never settled.
    if (newline === -1) break;

    const line = text.slice(pos, newline);
    const trimmed = line.trim();

    if (FENCE_RE.test(trimmed)) {
      if (!inFence && previousBlank && line === trimmed) boundary = pos;
      inFence = !inFence;
      if (!inFence) boundary = newline + 1;
      previousBlank = false;
    } else if (inFence) {
      previousBlank = false;
    } else if (trimmed === "") {
      previousBlank = true;
    } else {
      const startsBlock = line === line.trimStart() && !LIST_ITEM_RE.test(line);
      if (previousBlank && startsBlock) boundary = pos;
      previousBlank = false;
    }

    pos = newline + 1;
  }

  return boundary;
}

export interface TableData {
  meta: { name: string; type: string }[];
  data: unknown[][];
}

/** Convert a row-object result into the column meta and row arrays of the grid. */
export function toTableData(result: QueryResult): TableData {
  const { columns, columnTypes, data } = result;
  return {
    meta: columns.map((name, i) => ({ name, type: columnTypes[i] ?? "" })),
    data: data.map((row) => columns.map((column) => row[column])),
  };
}
