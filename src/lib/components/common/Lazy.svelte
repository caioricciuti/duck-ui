<script lang="ts" generics="Props extends Record<string, unknown>">
  import type { Component } from 'svelte'
  import Spinner from './Spinner.svelte'
  import Button from './Button.svelte'

  /**
   * Renders a component whose code is fetched on first use. Screens that many
   * sessions never open (notebooks, dashboards, settings) stay out of the
   * startup bundle this way.
   */
  let {
    load,
    props,
  }: {
    load: () => Promise<{ default: Component<Props> }>
    props: Props
  } = $props()

  let attempt = $state(0)
  const pending = $derived.by(() => {
    void attempt
    return load()
  })
</script>

{#await pending}
  <div class="flex h-full items-center justify-center"><Spinner /></div>
{:then module}
  <module.default {...props} />
{:catch}
  <!-- After a deploy the old chunk may be gone. A retry fetches the new one. -->
  <div class="flex h-full flex-col items-center justify-center gap-3 text-center" role="alert">
    <p class="text-[13px] text-fg-3">This screen could not be loaded.</p>
    <Button size="sm" variant="outline" onclick={() => attempt++}>Try again</Button>
  </div>
{/await}
