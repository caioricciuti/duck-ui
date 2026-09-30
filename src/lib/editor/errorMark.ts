import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export interface ErrorMark {
  from: number;
  to: number;
  message: string;
}

export const setErrorMark = StateEffect.define<ErrorMark | null>();

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setErrorMark)) continue;
      const mark = effect.value;
      if (!mark) return Decoration.none;
      const from = Math.max(0, Math.min(mark.from, tr.newDoc.length));
      const to = Math.max(from, Math.min(mark.to, tr.newDoc.length));
      if (from === to) return Decoration.none;
      return Decoration.set([
        Decoration.mark({
          class: "cm-sql-error",
          attributes: { title: mark.message },
        }).range(from, to),
      ]);
    }
    // The error described the text that ran. Once it is edited the mark
    // would point at something else.
    return tr.docChanged ? Decoration.none : marks;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.baseTheme({
  ".cm-sql-error": {
    textDecoration: "underline wavy var(--danger)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
    backgroundColor: "var(--danger-soft)",
    borderRadius: "2px",
  },
});

export const errorMark: Extension = [field, theme];
