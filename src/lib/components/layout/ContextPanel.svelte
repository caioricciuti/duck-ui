<script lang="ts">
  import { BookOpen, ExternalLink, Star } from 'lucide-svelte'
  import ExplorerPanel from '../explorer/ExplorerPanel.svelte'
  import { getRoute, getSection, goTo, isOnWorkspace } from '../../stores/router.svelte'
  import { groupForRoute, PAGE_ROUTES, sectionsFor, visibleRoutes } from '@/lib/routes'

  // Second column. On the workspace it is the schema explorer: resizable,
  // collapsible, width remembered. On a page it is a plain sidebar for the
  // active rail group: fixed width, always open, an icon per page, the
  // active page's sections nested under it.
  const route = $derived(getRoute())
  const group = $derived(groupForRoute(route))
  const routes = $derived(visibleRoutes(group))
</script>

<!-- The explorer stays mounted while a page is shown, so its expanded nodes
     and search survive a trip to Settings. -->
<div class="h-full shrink-0" hidden={!isOnWorkspace()}>
  <ExplorerPanel />
</div>

{#if !isOnWorkspace()}
  <div class="flex h-full w-56 shrink-0 flex-col overflow-hidden border-r border-edge-subtle bg-sidebar">
    <div class="flex h-12 shrink-0 items-center pl-4 pr-2">
      <span class="text-[13px] font-semibold tracking-[-0.01em] text-fg">{group.label}</span>
    </div>

    <nav class="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2" aria-label={group.label}>
      <div class="space-y-px">
        {#each routes as item (item)}
          {@const active = route === item}
          {@const meta = PAGE_ROUTES[item]}
          {@const sections = sectionsFor(item)}
          <button
            class="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors {active ? 'bg-active font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'}"
            onclick={() => goTo(item)}
            aria-current={active ? 'page' : undefined}
          >
            <meta.icon size={15} strokeWidth={1.75} class="shrink-0 {active ? 'text-accent' : 'text-fg-3'}" />
            <span class="truncate">{meta.label}</span>
          </button>
          {#if active && sections.length > 0}
            {@const current = getSection()}
            <div class="relative my-1 ml-[17px] pl-3 before:absolute before:bottom-1 before:left-0 before:top-1 before:w-px before:bg-edge">
              {#each sections as s (s.id)}
                <button
                  class="flex h-7 w-full items-center rounded-md px-2 text-[12.5px] transition-colors {current === s.id ? 'bg-hover font-medium text-fg' : 'text-fg-3 hover:bg-hover hover:text-fg'}"
                  onclick={() => goTo(item, s.id)}
                  aria-current={current === s.id ? 'true' : undefined}
                >
                  <span class="truncate">{s.label}</span>
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      </div>

      {#if group.id === 'settings'}
        <div class="mt-auto space-y-px border-t border-edge-subtle pt-2">
          <a
            class="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-2 transition-colors hover:bg-hover hover:text-fg"
            href="https://docs.duckui.com/" target="_blank" rel="noopener noreferrer"
          >
            <BookOpen size={15} strokeWidth={1.75} class="shrink-0 text-fg-3" />
            <span class="truncate">Docs</span>
            <ExternalLink size={12} class="ml-auto text-fg-4" />
          </a>
          <a
            class="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-2 transition-colors hover:bg-hover hover:text-fg"
            href="https://github.com/caioricciuti/duck-ui" target="_blank" rel="noopener noreferrer"
          >
            <Star size={15} strokeWidth={1.75} class="shrink-0 text-fg-3" />
            <span class="truncate">GitHub</span>
            <ExternalLink size={12} class="ml-auto text-fg-4" />
          </a>
          <p class="px-2 pt-1 font-mono text-[11px] text-fg-4">v{__DUCK_UI_VERSION__}</p>
        </div>
      {/if}
    </nav>
  </div>
{/if}
