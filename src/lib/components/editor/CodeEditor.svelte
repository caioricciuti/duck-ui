<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder as placeholderExt } from '@codemirror/view'
  import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
  import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
  import { bracketMatching, indentOnInput, indentUnit, foldGutter, foldKeymap } from '@codemirror/language'
  import { sql, PostgreSQL, schemaCompletionSource, keywordCompletionSource } from '@codemirror/lang-sql'
  import { editorTheme } from '@/lib/editor/theme'
  import { formatSql } from '@/lib/editor/formatSql'
  import { duckdbCompletionSource, toSqlSchema } from '@/lib/editor/sqlCompletion'
  import { diffStrings } from '@/lib/textDiff'
  import { duck } from '../../stores/duck.svelte'

  export type EditorLanguage = 'sql' | 'python' | 'markdown'

  interface Props {
    value: string
    language?: EditorLanguage
    /** Fires after edits settle, not on every keystroke. */
    onchange?: (value: string) => void
    /** Mod-Enter. Receives the whole document. */
    onrun?: (text: string) => void
    /** Mod-Shift-Enter. Receives the selection, or the whole document without one. */
    onrunselection?: (text: string) => void
    /** Notebook cells also run on Shift-Enter. */
    runOnShiftEnter?: boolean
    readonly?: boolean
    showLineNumbers?: boolean
    placeholder?: string
    /** Grow with the content between these pixel bounds instead of filling the parent. */
    autoHeight?: { min: number; max: number }
    /** Extra extensions, such as a collaborative binding or custom completion. */
    extensions?: Extension[]
    /**
     * Apply outside changes of `value` to the document. Off while a shared
     * document owns the text, where a stale value would overwrite remote edits.
     */
    syncValue?: boolean
    ariaLabel?: string
    class?: string
  }

  let {
    value,
    language = 'sql',
    onchange,
    onrun,
    onrunselection,
    runOnShiftEnter = false,
    readonly = false,
    showLineNumbers = true,
    placeholder = '',
    autoHeight,
    extensions = [],
    syncValue = true,
    ariaLabel = 'Code editor',
    class: cls = '',
  }: Props = $props()

  const CHANGE_DEBOUNCE_MS = 300

  let host: HTMLDivElement
  let view: EditorView | undefined
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  /** The last text handed to `onchange`, so an echo of our own edit is not re-applied. */
  let lastEmitted = untrack(() => value)
  /** The last `value` prop acted on. Only a prop that actually changed is an outside edit. */
  let lastSeenValue = untrack(() => value)

  const languageCompartment = new Compartment()
  const readonlyCompartment = new Compartment()
  const extraCompartment = new Compartment()

  const databases = $derived(duck((s) => s.databases))

  function selectionOrAll(target: EditorView): string {
    const { from, to } = target.state.selection.main
    const text = from === to ? target.state.doc.toString() : target.state.sliceDoc(from, to)
    return text.trim()
  }

  async function languageExtension(lang: EditorLanguage): Promise<Extension> {
    if (lang === 'python') return (await import('@codemirror/lang-python')).python()
    if (lang === 'markdown') return (await import('@codemirror/lang-markdown')).markdown()
    const schema = toSqlSchema(untrack(() => databases))
    const config = { dialect: PostgreSQL, schema, upperCaseKeywords: true }
    return [
      sql(config),
      autocompletion({
        override: [schemaCompletionSource(config), keywordCompletionSource(PostgreSQL, true), duckdbCompletionSource],
        activateOnTyping: true,
        maxRenderedOptions: 100,
        icons: false,
      }),
    ]
  }

  function flushChange() {
    clearTimeout(changeTimer)
    changeTimer = undefined
    if (!view) return
    const text = view.state.doc.toString()
    if (text === lastEmitted) return
    lastEmitted = text
    onchange?.(text)
  }

  /** Hands any edit still inside the debounce window to `onchange` now. */
  export function flush(): void {
    flushChange()
  }

  export function getValue(): string {
    return view?.state.doc.toString() ?? value
  }

  /**
   * Replaces the text as one minimal edit, which keeps the cursor, the scroll
   * position and the undo history where a full replace would reset them.
   */
  export function setValue(next: string): void {
    if (!view) return
    const edit = diffStrings(view.state.doc.toString(), next)
    if (!edit) return
    lastEmitted = next
    view.dispatch({ changes: { from: edit.start, to: edit.start + edit.deleteLength, insert: edit.insert } })
  }

  export function getSelectedOrAll(): string {
    return view ? selectionOrAll(view) : value.trim()
  }

  export async function format(): Promise<void> {
    if (!view || language !== 'sql' || readonly) return
    const before = view.state.doc.toString()
    const formatted = await formatSql(before)
    // Typing continued while the formatter loaded: keep what was typed.
    if (!view || view.state.doc.toString() !== before) return
    setValue(formatted)
    flushChange()
  }

  export function focus(): void {
    view?.focus()
  }

  export function getView(): EditorView | undefined {
    return view
  }

  onMount(() => {
    const runKeys = Prec.highest(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: (target) => {
            flushChange()
            onrun?.(target.state.doc.toString().trim())
            return true
          },
        },
        {
          key: 'Mod-Shift-Enter',
          run: (target) => {
            flushChange()
            ;(onrunselection ?? onrun)?.(selectionOrAll(target))
            return true
          },
        },
        {
          key: 'Shift-Enter',
          run: (target) => {
            if (!runOnShiftEnter) return false
            flushChange()
            onrun?.(target.state.doc.toString().trim())
            return true
          },
        },
        {
          key: 'Alt-f',
          run: () => {
            if (language !== 'sql') return false
            void format()
            return true
          },
        },
      ]),
    )

    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          runKeys,
          ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []),
          history(),
          drawSelection(),
          indentOnInput(),
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          languageCompartment.of([]),
          readonlyCompartment.of([EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)]),
          extraCompartment.of(extensions),
          editorTheme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false', autocapitalize: 'off' }),
          ...(placeholder ? [placeholderExt(placeholder)] : []),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            clearTimeout(changeTimer)
            changeTimer = setTimeout(flushChange, CHANGE_DEBOUNCE_MS)
          }),
        ],
      }),
    })

    return () => {
      // An edit made inside the debounce window must not be lost on unmount.
      flushChange()
      view?.destroy()
      view = undefined
    }
  })

  // Language, and for SQL the catalog it completes from.
  $effect(() => {
    const lang = language
    void databases
    let cancelled = false
    void languageExtension(lang).then((extension) => {
      if (!cancelled) view?.dispatch({ effects: languageCompartment.reconfigure(extension) })
    })
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    view?.dispatch({
      effects: readonlyCompartment.reconfigure([EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)]),
    })
  })

  $effect(() => {
    view?.dispatch({ effects: extraCompartment.reconfigure(extensions) })
  })

  // The store changed the text from outside: a formatter, an AI fix, a restored tab.
  $effect(() => {
    const next = value
    if (next === lastSeenValue) return
    lastSeenValue = next
    if (!syncValue || !view || next === lastEmitted || next === view.state.doc.toString()) return
    // A pending local edit is newer than what the store just echoed back.
    if (changeTimer !== undefined) return
    setValue(next)
  })
</script>

<div
  bind:this={host}
  class="code-editor min-h-0 overflow-hidden {autoHeight ? '' : 'h-full'} {cls}"
  style={autoHeight ? `min-height:${autoHeight.min}px;max-height:${autoHeight.max}px` : ''}
></div>

<style>
  .code-editor :global(.cm-editor) {
    height: 100%;
    max-height: inherit;
  }
</style>
