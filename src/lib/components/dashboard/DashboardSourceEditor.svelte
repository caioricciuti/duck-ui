<script lang="ts">
  import type { Extension } from '@codemirror/state'
  import CodeEditor from '../editor/CodeEditor.svelte'
  import { dashboardCompletion } from '@/lib/editor/dashboardCompletion'

  /**
   * The dashboard source, in markdown mode.
   *
   * The editor owns the text while it is open. What comes back through
   * `value` is only applied when it differs from what the editor last
   * reported, so a debounced store update never fights the caret.
   */
  interface Props {
    value: string
    /** Fires after edits settle, and once more when the editor closes. */
    onchange: (value: string) => void
    /**
     * Extra CodeMirror extensions for a live session: the Yjs binding that
     * merges edits on the shared text, and remote cursors. Empty outside a
     * session.
     */
    collabExtensions?: Extension[]
    ariaLabel?: string
  }

  let { value, onchange, collabExtensions = [], ariaLabel = 'Dashboard source' }: Props = $props()

  // Dashboard specific autocomplete: component tags, props, query names and
  // ${inputs.…} variables. Given to this editor only, so notebook markdown
  // and any other markdown surface stay plain.
  const completion = dashboardCompletion()
  const extensions = $derived([completion, ...collabExtensions])
</script>

<CodeEditor
  {value}
  language="markdown"
  {onchange}
  {extensions}
  {ariaLabel}
  syncValue={collabExtensions.length === 0}
  placeholder="# Title"
/>
