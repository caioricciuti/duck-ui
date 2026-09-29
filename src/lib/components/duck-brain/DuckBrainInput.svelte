<script lang="ts">
  import { tick } from 'svelte'
  import { Send, Square } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Spinner from '../common/Spinner.svelte'
  import SchemaAutocomplete from './SchemaAutocomplete.svelte'
  import type { DatabaseInfo } from '@/store'
  import { estimateTokens, formatTokenCount } from '@/lib/duckBrain/tokenEstimate'
  import { buildSchemaSuggestions, type SchemaSuggestion } from '@/lib/duckBrain/schemaSuggestions'
  import { splitMentions } from '@/lib/duckBrain/chatText'

  interface Props {
    onsend: (message: string) => void
    onabort?: () => void
    generating: boolean
    disabled?: boolean
    placeholder?: string
    databases?: DatabaseInfo[]
    /** Estimated tokens of everything sent besides the draft (schema, history, system prompt). */
    baselineTokens?: number
  }

  let {
    onsend,
    onabort,
    generating,
    disabled = false,
    placeholder = 'Ask Duck Brain to write SQL... (@ for tables)',
    databases = [],
    baselineTokens,
  }: Props = $props()

  const MAX_HEIGHT = 120
  const listId = `brain-mentions-${Math.random().toString(36).slice(2, 8)}`

  let input = $state('')
  let autocompleteOpen = $state(false)
  let suggestions = $state.raw<SchemaSuggestion[]>([])
  let activeIndex = $state(0)
  let mentionStart = $state<number | null>(null)
  let scrollTop = $state(0)
  let textarea = $state<HTMLTextAreaElement | null>(null)
  let form = $state<HTMLFormElement | null>(null)

  const parts = $derived(splitMentions(input))
  const hasMentions = $derived(parts.some((part) => part.type === 'mention'))

  // Auto-resize with the draft, up to MAX_HEIGHT, then the textarea scrolls.
  $effect(() => {
    input
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`
  })

  function closeAutocomplete() {
    autocompleteOpen = false
    mentionStart = null
  }

  // Detect an @ mention under the cursor and filter the suggestions for it.
  function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
    const value = e.currentTarget.value
    const cursor = e.currentTarget.selectionStart ?? 0
    const beforeCursor = value.slice(0, cursor)
    const lastAt = beforeCursor.lastIndexOf('@')

    if (lastAt !== -1) {
      const afterAt = beforeCursor.slice(lastAt + 1)
      // Whitespace between @ and the cursor means the mention has ended.
      if (!/\s/.test(afterAt)) {
        const filtered = buildSchemaSuggestions(databases, afterAt)
        mentionStart = lastAt
        suggestions = filtered
        autocompleteOpen = filtered.length > 0
        activeIndex = 0
        return
      }
    }
    closeAutocomplete()
  }

  async function insertSuggestion(suggestion: SchemaSuggestion) {
    if (mentionStart === null) return

    const before = input.slice(0, mentionStart)
    const cursor = textarea?.selectionStart ?? input.length
    const after = input.slice(cursor)
    // Keep the @ prefix so the mention is highlighted and sent as typed.
    const inserted = `@${suggestion.fullPath}`

    input = `${before}${inserted} ${after}`
    closeAutocomplete()

    await tick()
    const position = before.length + inserted.length + 1
    textarea?.focus()
    textarea?.setSelectionRange(position, position)
  }

  function submit() {
    const message = input.trim()
    if (!message || generating || disabled) return
    onsend(message)
    input = ''
    closeAutocomplete()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (autocompleteOpen && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          activeIndex = (activeIndex + 1) % suggestions.length
          return
        case 'ArrowUp':
          e.preventDefault()
          activeIndex = activeIndex === 0 ? suggestions.length - 1 : activeIndex - 1
          return
        case 'Tab':
        case 'Enter':
          if (suggestions[activeIndex]) {
            e.preventDefault()
            void insertSuggestion(suggestions[activeIndex])
            return
          }
          break
        case 'Escape':
          // preventDefault tells the sheet this Escape was used up here.
          e.preventDefault()
          closeAutocomplete()
          return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !autocompleteOpen) {
      e.preventDefault()
      submit()
    }
  }

  function handleDocumentMousedown(e: MouseEvent) {
    if (form && !form.contains(e.target as Node)) autocompleteOpen = false
  }
</script>

<svelte:document onmousedown={handleDocumentMousedown} />

<form
  bind:this={form}
  class="relative"
  onsubmit={(e) => {
    e.preventDefault()
    submit()
  }}
>
  <div class="relative">
    {#if hasMentions}
      <!-- Highlight layer under the caret. It must keep the exact text metrics of
           the textarea, so mentions are tinted without padding or icons. -->
      <div
        class="pointer-events-none absolute inset-0 overflow-hidden border border-transparent py-2 pl-2.5 pr-11 text-[13px] leading-relaxed text-fg"
        aria-hidden="true"
      >
        <div class="whitespace-pre-wrap break-words" style="transform: translateY(-{scrollTop}px)">
          {#each parts as part}{#if part.type === 'mention'}<span class="rounded-sm bg-accent-soft text-accent">@{part.value}</span>{:else}{part.value}{/if}{/each}
        </div>
      </div>
    {/if}

    <textarea
      bind:this={textarea}
      bind:value={input}
      rows="1"
      {placeholder}
      disabled={disabled || generating}
      role="combobox"
      aria-label="Message Duck Brain"
      aria-autocomplete="list"
      aria-expanded={autocompleteOpen}
      aria-controls={autocompleteOpen ? listId : undefined}
      aria-activedescendant={autocompleteOpen ? `${listId}-${activeIndex}` : undefined}
      class="block max-h-[120px] min-h-[36px] w-full resize-none rounded-md border border-edge bg-surface py-2 pl-2.5 pr-11 text-[13px] leading-relaxed placeholder:text-fg-4 transition-colors duration-100 hover:border-edge-strong focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50
        {hasMentions ? 'text-transparent caret-fg' : 'text-fg'}"
      oninput={handleInput}
      onkeydown={handleKeydown}
      onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
    ></textarea>

    <SchemaAutocomplete
      id={listId}
      open={autocompleteOpen}
      {suggestions}
      {activeIndex}
      onselect={(suggestion) => void insertSuggestion(suggestion)}
    />

    <div class="absolute bottom-1 right-1">
      {#if generating}
        <Button icon variant="ghost" size="sm" class="text-danger hover:text-danger" aria-label="Stop generating" onclick={() => onabort?.()}>
          <Square size={14} />
        </Button>
      {:else}
        <Button icon variant="ghost" size="sm" type="submit" disabled={!input.trim() || disabled} aria-label="Send message">
          {#if disabled}
            <Spinner size="sm" class="h-3.5 w-3.5" />
          {:else}
            <Send size={14} />
          {/if}
        </Button>
      {/if}
    </div>
  </div>

  <!-- Pre-run token estimate: schema + history + prompt + current draft (#23) -->
  {#if baselineTokens !== undefined}
    <div
      class="select-none px-1 pt-1 text-[10px] text-fg-3"
      title="Rough estimate of tokens sent with this request (schema context, chat history, system prompt, and your message)"
    >
      ~{formatTokenCount(baselineTokens + estimateTokens(input))} tokens will be sent
    </div>
  {/if}
</form>
