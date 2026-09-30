<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import DuckBrainPanel from './DuckBrainPanel.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { trapFocus } from '../../utils/focus-trap'
  import { getUiConfig } from '@/lib/appConfig'

  /**
   * Duck Brain as a global slide-over.
   *
   * One mount for the whole app, driven by the store's `isPanelOpen`, so the
   * assistant opens from anywhere (Home card, SQL editor button, command
   * palette) instead of existing only inside SQL tabs. "Insert" targets the
   * active SQL tab and is only offered when there is one.
   *
   * It does not use common/Sheet: the panel brings its own header with a
   * close button and needs the full height without padding for the chat.
   */

  const titleId = 'duck-brain-title'

  // The kiosk flag is read together with the store value, so it is looked up
  // again on every open and not frozen at the value it had before boot.
  const open = $derived(duck((s) => s.duckBrain.isPanelOpen) && !getUiConfig().hideBrain)
  const sqlTabId = $derived(
    duck((s) => {
      const active = s.tabs.find((t) => t.id === s.activeTabId)
      return active?.type === 'sql' ? active.id : ''
    }),
  )

  function close() {
    duckActions().toggleBrainPanel()
  }

  function handleKeydown(e: KeyboardEvent) {
    // defaultPrevented: the mention popup already used this Escape.
    if (open && e.key === 'Escape' && !e.defaultPrevented) close()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-40 bg-black/50" onclick={close} role="presentation" transition:fade={{ duration: 120 }}></div>

  <div
    class="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-hidden border-l border-edge bg-elevated"
    style="box-shadow: var(--shadow-modal)"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    use:trapFocus
    transition:fly={{ x: 320, duration: 180 }}
  >
    <DuckBrainPanel tabId={sqlTabId} {titleId} />
  </div>
{/if}
