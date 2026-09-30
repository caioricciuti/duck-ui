/**
 * CodeMirror wiring for dashboard authoring intelligence.
 *
 * The logic lives in `services/dashboard/authoring.ts` (pure, tested); this
 * file adapts it to CodeMirror's completion API. The extension is handed to
 * the dashboard source editor only, so notebook markdown or any future
 * markdown surface stays untouched.
 */

import {
  autocompletion,
  pickedCompletion,
  snippetCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  authoringContext,
  authoringSnippets,
  inputNamesIn,
  propsForComponent,
  queryNamesIn,
} from "@/services/dashboard/authoring";

/** Characters that opened the suggestion list in the Monaco provider. */
const TRIGGER_CHARACTERS = ["<", "{", "$", ".", " "];

/** The data slot as `authoring.ts` writes it, in Monaco snippet syntax. */
const DATA_SLOT = "{${1:query_name}}";

type ApplyFunction = (view: EditorView, completion: Completion, from: number, to: number) => void;

/**
 * Translates a Monaco snippet into CodeMirror's template syntax.
 *
 * CodeMirror has tabstops with default text and nothing else, so a choice
 * (`${1|a,b|}`) keeps its first option as the default and the final cursor
 * position (`$0`) becomes a last, empty field.
 */
export const toCodeMirrorTemplate = (insertText: string): string =>
  insertText.replace(/\$\{(\d+)\|([^,|}]*)[^}]*\}/g, "${$1:$2}").replace(/\$0/g, "${}");

/**
 * Applies a completion, then opens the list again.
 *
 * Used where the inserted text lands the cursor in a `data={...}` slot: the
 * queries that exist are offered right away, which is what the Monaco choice
 * placeholder did.
 */
const thenSuggest = (completion: Completion): Completion => {
  const apply = completion.apply;
  if (typeof apply !== "function") return completion;
  const wrapped: ApplyFunction = (view, picked, from, to) => {
    apply(view, picked, from, to);
    // After the accept has settled. Opened in the same tick, the new list
    // can be swallowed by the close of the one just accepted.
    setTimeout(() => {
      if (view.dom.isConnected) startCompletion(view);
    }, 0);
  };
  return { ...completion, apply: wrapped };
};

/** Inserts `text`, swallowing a `}` that bracket closing already put after the cursor. */
const insertClosingBrace =
  (text: string): ApplyFunction =>
  (view, completion, from, to) => {
    const end = Math.max(to, view.state.selection.main.to);
    const closed = view.state.sliceDoc(end, end + 1) === "}";
    view.dispatch({
      changes: { from, to: closed ? end + 1 : end, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
      userEvent: "input.complete",
      annotations: pickedCompletion.of(completion),
    });
  };

const SORT_BOOST: Record<string, number> = { "0": 20, "1": 10, "2": 0 };

const complete = (context: CompletionContext): CompletionResult | null => {
  const { state, pos, explicit } = context;
  const before = state.sliceDoc(0, pos);
  const source = state.doc.toString();
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const word = /[A-Za-z0-9_]*$/.exec(line)?.[0] ?? "";
  const from = pos - word.length;

  // While typing, offer only inside a word or right after a trigger
  // character. Ctrl+Space works everywhere regardless.
  if (!explicit && word.length === 0 && !TRIGGER_CHARACTERS.includes(line.slice(-1))) return null;

  const authoring = authoringContext(before);

  switch (authoring.kind) {
    case "sql":
      // Inside a query fence: SQL, not dashboard markup.
      return null;

    case "query-ref": {
      const names = queryNamesIn(source);
      if (names.length === 0) return null;
      return {
        from,
        options: names.map((name) => ({
          label: name,
          type: "variable",
          detail: "Query in this dashboard",
        })),
      };
    }

    case "input-var": {
      const typed = /\$\{([A-Za-z0-9_.]*)$/.exec(line)?.[1] ?? "";
      const options: Completion[] = [];
      for (const input of inputNamesIn(source)) {
        const parts = input.isRange ? ["start", "end"] : ["value"];
        for (const part of parts) {
          const label = `inputs.${input.name}.${part}`;
          options.push({
            label,
            type: "variable",
            detail: input.isRange ? "Date range input" : "Input variable",
            apply: insertClosingBrace(`${label}}`),
          });
        }
      }
      if (options.length === 0) return null;
      // Replaces everything typed after `${`, so `${inputs.re` does not end
      // up as `${inputs.inputs.region.value}`.
      return { from: pos - typed.length, options };
    }

    case "component-props": {
      const hasQueries = queryNamesIn(source).length > 0;
      const options = propsForComponent(authoring.tag).map((prop): Completion => {
        const base: Completion = {
          label: prop,
          type: "property",
          detail: `<${authoring.tag}> prop`,
        };
        if (prop !== "data") return { ...base, apply: `${prop}=` };
        const data = snippetCompletion("data={${1}}", base);
        return hasQueries ? thenSuggest(data) : data;
      });
      return options.length > 0 ? { from, options } : null;
    }

    case "top": {
      // `<` may already be typed; the snippet must not double it.
      const openBracket = /<[A-Za-z]*$/.test(line);
      const snippets = authoringSnippets();

      if (!explicit && !openBracket) {
        // Prose is mostly words. Offering scaffolds for every one of them
        // would put a snippet behind each Enter, so outside a tag the list
        // only opens for a line that starts like a scaffold's name.
        const startsLine = /^\s*[A-Za-z]+$/.test(line);
        if (!startsLine || !snippets.some((snippet) => snippet.label.startsWith(word))) {
          return null;
        }
      }

      // The first real query name is the data slot's default text, and the
      // list opens again inside the slot to offer the other ones.
      const names = queryNamesIn(source);
      const dataSlot = names.length > 0 ? `{\${1:${names[0]}}}` : DATA_SLOT;

      const options: Completion[] = [];
      for (const snippet of snippets) {
        const startsWithTag = snippet.insertText.startsWith("<");
        // After `<` only tags make sense: `<` followed by a fence is nothing.
        if (openBracket && !startsWithTag) continue;
        const hasDataSlot = snippet.insertText.includes(DATA_SLOT);
        let template = toCodeMirrorTemplate(snippet.insertText.replace(DATA_SLOT, dataSlot));
        if (openBracket) template = template.slice(1);
        const completion = snippetCompletion(template, {
          label: snippet.label,
          type: startsWithTag ? "class" : "keyword",
          detail: snippet.detail,
          boost: SORT_BOOST[snippet.sort] ?? 0,
        });
        options.push(hasDataSlot && names.length > 0 ? thenSuggest(completion) : completion);
      }
      return { from, options };
    }
  }
};

/** Dashboard completions for one position. Exported for tests. */
export const dashboardCompletionSource: CompletionSource = (context) => {
  try {
    return complete(context);
  } catch {
    // A parse hiccup must never take typing down with it.
    return null;
  }
};

/**
 * Dashboard specific autocomplete: component tags, props, query names and
 * `${inputs.…}` variables. Pass the result to the editor's `extensions`.
 */
export const dashboardCompletion = (): Extension =>
  autocompletion({
    override: [dashboardCompletionSource],
    // The whole point of the authoring experience is that components, props,
    // query names and input variables offer themselves as you type.
    activateOnTyping: true,
    maxRenderedOptions: 100,
    icons: false,
  });
