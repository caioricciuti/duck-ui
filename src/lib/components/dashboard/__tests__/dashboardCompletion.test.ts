import { describe, expect, it } from "vitest";
import { CompletionContext, type Completion } from "@codemirror/autocomplete";
import { EditorState, Transaction, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  dashboardCompletion,
  dashboardCompletionSource,
  toCodeMirrorTemplate,
} from "@/lib/editor/dashboardCompletion";
import { starterSource } from "@/services/dashboard/markdown";

/** Enough of a view for `apply`: a state, and a dispatch that advances it. */
const fakeView = (doc: string, anchor = doc.length, head = anchor) => {
  const view = {
    state: EditorState.create({
      doc,
      selection: { anchor, head },
      extensions: [dashboardCompletion()],
    }),
    dispatch(...specs: (Transaction | TransactionSpec)[]) {
      const [first] = specs;
      view.state = (first instanceof Transaction ? first : view.state.update(...specs)).state;
    },
  };
  return view;
};

const suggest = (state: EditorState, explicit = false) => {
  const result = dashboardCompletionSource(
    new CompletionContext(state, state.selection.main.from, explicit)
  );
  if (result instanceof Promise) throw new Error("the source is synchronous");
  return result;
};

const accept = (view: ReturnType<typeof fakeView>, label: string, explicit = false) => {
  const result = suggest(view.state, explicit);
  const option = result?.options.find((entry: Completion) => entry.label === label);
  if (!result || !option) throw new Error(`no completion "${label}"`);
  const to = view.state.selection.main.from;
  if (typeof option.apply === "function") {
    option.apply(view as unknown as EditorView, option, result.from, to);
  } else {
    view.dispatch({ changes: { from: result.from, to, insert: option.apply ?? option.label } });
  }
};

const labels = (state: EditorState, explicit = false) =>
  suggest(state, explicit)?.options.map((option) => option.label) ?? [];

const TWO_QUERIES = "```sql first\nSELECT 1\n```\n\n```sql second\nSELECT 2\n```\n\n";

describe("toCodeMirrorTemplate", () => {
  it("keeps the first choice as the default text", () => {
    expect(toCodeMirrorTemplate("agg=${3|sum,avg,min|} title='${4:Title}'")).toBe(
      "agg=${3:sum} title='${4:Title}'"
    );
  });

  it("turns the final cursor into a last field", () => {
    expect(toCodeMirrorTemplate("<Grid cols=${1:2}>\n\t$0\n</Grid>")).toBe(
      "<Grid cols=${1:2}>\n\t${}\n</Grid>"
    );
  });
});

describe("dashboardCompletionSource", () => {
  it("offers nothing inside a sql fence", () => {
    expect(suggest(fakeView("```sql q\nSEL").state, true)).toBeNull();
  });

  it("offers components by name after a typed <", () => {
    const view = fakeView(`${starterSource("Doc")}\n<BarCh`);
    expect(labels(view.state)).toContain("BarChart");
    expect(labels(view.state)).not.toContain("sql");
  });

  it("scaffolds a component without doubling the <, with a real query in the data slot", () => {
    const view = fakeView(`${starterSource("Doc")}\n<BarCh`);
    accept(view, "BarChart");
    const text = view.state.doc.toString();
    expect(text).toContain("\n<BarChart data={my_query} x=x_column y=y_column/>");
    expect(text).not.toContain("<<");
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("my_query");
  });

  it("offers every query inside the data slot, and accepting one completes the reference", () => {
    const view = fakeView(`${TWO_QUERIES}<Line`);
    accept(view, "LineChart");
    expect(view.state.doc.toString()).toContain("<LineChart data={first}");
    // The placeholder is selected: nothing typed, every name on offer.
    expect(labels(view.state, true)).toEqual(["first", "second"]);

    const result = suggest(view.state, true);
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from: result?.from ?? from, to, insert: "second" } });
    expect(view.state.doc.toString()).toContain("<LineChart data={second} x=");
  });

  it("falls back to a placeholder when the document has no query", () => {
    const view = fakeView("<DataT");
    accept(view, "DataTable");
    expect(view.state.doc.toString()).toBe("<DataTable data={query_name}/>");
  });

  it("offers props inside an open tag, data as a slot", () => {
    const view = fakeView(`${TWO_QUERIES}<BarChart `);
    expect(labels(view.state)).toEqual(["data", "x", "y", "series", "title", "type"]);
    accept(view, "data");
    expect(view.state.doc.toString()).toContain("<BarChart data={}");
    expect(labels(view.state, true)).toEqual(["first", "second"]);

    const plain = fakeView("<BarChart ");
    accept(plain, "x");
    expect(plain.state.doc.toString()).toBe("<BarChart x=");
  });

  it("offers input variables after ${, ranges as start and end", () => {
    const doc = "<Dropdown name=region options='a,b'/>\n<DateRange name=period/>\n\nText ${";
    const view = fakeView(doc);
    expect(labels(view.state)).toEqual([
      "inputs.region.value",
      "inputs.period.start",
      "inputs.period.end",
    ]);
    accept(view, "inputs.period.end");
    expect(view.state.doc.toString().endsWith("Text ${inputs.period.end}")).toBe(true);
  });

  it("replaces what was typed after ${ and reuses an auto-closed brace", () => {
    const doc = "<Dropdown name=region options='a,b'/>\n\n${inputs.re}";
    const view = fakeView(doc, doc.length - 1);
    accept(view, "inputs.region.value");
    expect(view.state.doc.toString().endsWith("\n${inputs.region.value}")).toBe(true);
  });

  it("stays quiet in prose, and answers when asked", () => {
    const view = fakeView("Some words here");
    expect(suggest(view.state)).toBeNull();
    expect(suggest(fakeView("Some words ").state)).toBeNull();
    expect(labels(view.state, true)).toContain("sql");
    expect(labels(view.state, true)).toContain("BarChart");
  });

  it("offers scaffolds for a line that starts like one", () => {
    expect(labels(fakeView("# Title\n\nsq").state)).toContain("sql");
    expect(suggest(fakeView("# Title\n\nThe").state)).toBeNull();
  });
});
