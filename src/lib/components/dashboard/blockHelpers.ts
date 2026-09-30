import type { ComponentBlock, ComponentPropValue } from "@/services/dashboard/markdown";
import type { DatasetResult } from "@/services/dashboard/queryRunner";
import type { QueryResult } from "@/store/types";

/** A prop as text, whatever kind the parser gave it. */
export const propText = (value: ComponentPropValue | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.kind === "literal") return value.value;
  if (value.kind === "number") return String(value.value);
  if (value.kind === "boolean") return value.value ? "true" : "false";
  return value.name;
};

export const propNumber = (value: ComponentPropValue | undefined): number | undefined =>
  value?.kind === "number" ? value.value : undefined;

export type BoundData =
  | { state: "missing" }
  | { state: "loading" }
  | { state: "error"; error?: string }
  | { state: "ready"; result: QueryResult };

/** The result a component's `data={name}` points at, in every state. */
export const resolveData = (
  block: ComponentBlock,
  results: ReadonlyMap<string, DatasetResult>
): BoundData => {
  const data = block.props.data;
  if (!data || data.kind !== "reference") return { state: "missing" };
  const entry = results.get(data.name);
  if (!entry) return { state: "missing" };
  if (entry.status === "loading") return { state: "loading" };
  if (entry.status === "error" || !entry.result) return { state: "error", error: entry.error };
  return { state: "ready", result: entry.result };
};

/**
 * A link target that is safe to put in an `href`.
 *
 * The document can come from a share link, so `<LinkButton url=...>` is
 * untrusted: only web and mail links pass, anything else (`javascript:`,
 * `data:`) becomes a dead anchor.
 */
export const safeHref = (raw: string | undefined): string => {
  const value = (raw ?? "").trim();
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^[#/]/.test(value) && !value.startsWith("//")) return value;
  return "#";
};

/** CSV text for a result: every field with a comma, quote or newline is quoted. */
export const resultToCsv = (result: QueryResult): string => {
  const header = result.columns.join(",");
  const rows = result.data.map((row) =>
    result.columns
      .map((column) => {
        const cell = row[column];
        const text = cell === null || cell === undefined ? "" : String(cell);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",")
  );
  return [header, ...rows].join("\n");
};
