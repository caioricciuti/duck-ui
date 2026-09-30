import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * One theme for both modes: every color is a design token, so switching the
 * app theme restyles the editor with no reconfiguration.
 */
const chrome = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--fg)",
    backgroundColor: "var(--canvas)",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "20px",
    fontVariantLigatures: "none",
  },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 12px 0 8px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in oklab, var(--accent), transparent 72%)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--accent), transparent 86%)" },
  ".cm-searchMatch": {
    backgroundColor: "var(--warning-soft)",
    outline: "1px solid color-mix(in oklab, var(--warning), transparent 50%)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklab, var(--accent), transparent 60%)",
  },
  ".cm-activeLine": { backgroundColor: "var(--hover)" },
  ".cm-gutters": {
    backgroundColor: "var(--canvas)",
    color: "var(--fg-4)",
    border: "none",
    borderRight: "1px solid var(--edge-subtle)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "36px" },
  ".cm-activeLineGutter": { backgroundColor: "var(--hover)", color: "var(--fg-2)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--surface-2)",
    border: "none",
    color: "var(--fg-3)",
  },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "var(--accent-soft)",
    outline: "1px solid var(--accent-ring)",
  },
  ".cm-placeholder": { color: "var(--fg-4)" },
  ".cm-tooltip": {
    backgroundColor: "var(--elevated)",
    color: "var(--fg)",
    border: "1px solid var(--edge)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-popover)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    maxHeight: "260px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "3px 8px", lineHeight: "18px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--fg)",
  },
  ".cm-completionLabel": { color: "var(--fg)" },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: "var(--accent)",
    fontWeight: "600",
  },
  ".cm-completionDetail": { color: "var(--fg-3)", fontStyle: "normal", marginLeft: "12px" },
  ".cm-completionIcon": { color: "var(--fg-4)", opacity: "1" },
  ".cm-snippetField": { backgroundColor: "var(--accent-soft)" },
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--fg-2)",
    borderColor: "var(--edge-subtle)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--edge-subtle)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--edge-subtle)" },
  ".cm-panel.cm-search": { padding: "6px 8px", fontFamily: "var(--font-sans)", fontSize: "12px" },
  ".cm-textfield": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--edge)",
    borderRadius: "var(--radius-md)",
    color: "var(--fg)",
    fontSize: "12px",
  },
  ".cm-textfield:focus": { borderColor: "var(--accent)", outline: "none" },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--edge)",
    borderRadius: "var(--radius-md)",
    color: "var(--fg-2)",
    fontSize: "12px",
  },
  ".cm-button:hover": { backgroundColor: "var(--active)" },
  ".cm-panel.cm-search [name=close]": { color: "var(--fg-3)", cursor: "pointer" },
});

const syntax = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--accent)", fontWeight: "500" },
  { tag: [t.string, t.special(t.string), t.character], color: "var(--success)" },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: "var(--info)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--fg-4)", fontStyle: "italic" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--warning)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--fg)" },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: "var(--fg-3)" },
  { tag: [t.variableName, t.propertyName, t.name], color: "var(--fg-2)" },
  { tag: t.special(t.variableName), color: "var(--danger)" },
  { tag: t.heading, color: "var(--fg)", fontWeight: "600" },
  { tag: [t.link, t.url], color: "var(--info)", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.monospace, color: "var(--success)" },
  { tag: [t.tagName, t.angleBracket], color: "var(--accent)" },
  { tag: t.attributeName, color: "var(--warning)" },
  { tag: t.invalid, color: "var(--danger)" },
]);

export const editorTheme: Extension = [chrome, syntaxHighlighting(syntax)];
