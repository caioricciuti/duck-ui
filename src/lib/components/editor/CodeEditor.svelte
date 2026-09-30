<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder as placeholderExt } from '@codemirror/view'
  import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewlineKeepIndent } from '@codemirror/commands'
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
  import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
  import { bracketMatching, indentOnInput, indentUnit, foldGutter, foldKeymap } from '@codemirror/language'
  import { sql, PostgreSQL, schemaCompletionSource, keywordCompletionSource } from '@codemirror/lang-sql'
  import { editorTheme } from '@/lib/editor/theme'
  import { formatSql } from '@/lib/editor/formatSql'
  import { duckdbCompletionSource, toSqlSchema } from '@/lib/editor/sqlCompletion'
  import { diffStrings } from '@/lib/textDiff'
  import { errorMark, setErrorMark, type ErrorMark } from '@/lib/editor/errorMark'
  import { statementAt } from '@/lib/editor/statements'
  import { duck } from '../../stores/duck.svelte'

  export type EditorLanguage = 'sql' | 'python' | 'markdown'

  interface Props {
    value: string
    language?: EditorLanguage
    /** Fires after edits settle, not on every keystroke. */
    onchange?: (value: string) => void
    /**
     * Mod-Enter. Receives the text to run and the offset it starts at, so an
     * error position can be mapped back into the document.
     */
    onrun?: (text: string, from: number) => void
    /**
     * Mod-Shift-Enter. In `document` scope it receives the selection, or the
     * whole document without one. In `statement` scope it receives the whole
     * document.
     */
    onrunselection?: (text: string, from: number) => void
    /**
     * What Mod-Enter runs. `document`: everything. `statement`: the selection,
     * or the statement the cursor is in.
     */
    runScope?: 'document' | 'statement'
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
    runScope = 'document',
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

  interface RunTarget {
    text: string
    from: number
  }

  /** Trimmed text and the offset its first character has in the document. */
  function trimmed(raw: string, offset: number): RunTarget {
    const text = raw.trim()
    return { text, from: offset + (raw.length - raw.trimStart().length) }
  }

  function wholeDocument(target: EditorView): RunTarget {
    return trimmed(target.state.doc.toString(), 0)
  }

  function selectionOrAll(target: EditorView): RunTarget {
    const { from, to } = target.state.selection.main
    return from === to ? wholeDocument(target) : trimmed(target.state.sliceDoc(from, to), from)
  }

  function primaryTarget(target: EditorView): RunTarget {
    if (runScope !== 'statement') return wholeDocument(target)
    const { from, to, head } = target.state.selection.main
    if (from !== to) return trimmed(target.state.sliceDoc(from, to), from)
    const statement = statementAt(target.state.doc.toString(), head)
    return statement ? { text: statement.text, from: statement.from } : { text: '', from: 0 }
  }

  async function languageExtension(lang: EditorLanguage): Promise<Extension> {
    if (lang === 'python') return (await import('@codemirror/lang-python')).python()
    if (lang === 'markdown') {
      const { markdown, insertNewlineContinueMarkup } = await import('@codemirror/lang-markdown')
      return [
        markdown(),
        // Markdown embeds HTML, and its indentation treats a component tag
        // such as <Dropdown .../> as an open element, so the default Enter
        // indents every following line. An indented ```sql fence is no longer
        // a fence. Enter continues lists and quotes, and otherwise keeps the
        // indentation of the line it leaves.
        Prec.high(keymap.of([{ key: 'Enter', run: (view) => insertNewlineContinueMarkup(view) || insertNewlineKeepIndent(view) }])),
      ]
    }
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
    return view ? selectionOrAll(view).text : value.trim()
  }

  /** What Mod-Enter would run right now. */
  export function getRunTarget(): RunTarget {
    return view ? primaryTarget(view) : trimmed(value, 0)
  }

  /** Underlines a range with a message, or clears the mark with null. */
  export function markError(mark: ErrorMark | null): void {
    view?.dispatch({ effects: setErrorMark.of(mark) })
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
            const { text, from } = primaryTarget(target)
            onrun?.(text, from)
            return true
          },
        },
        {
          key: 'Mod-Shift-Enter',
          run: (target) => {
            flushChange()
            const { text, from } = runScope === 'statement' ? wholeDocument(target) : selectionOrAll(target)
            ;(onrunselection ?? onrun)?.(text, from)
            return true
          },
        },
        {
          key: 'Shift-Enter',
          run: (target) => {
            if (!runOnShiftEnter) return false
            flushChange()
            const { text, from } = wholeDocument(target)
            onrun?.(text, from)
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
          errorMark,
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
