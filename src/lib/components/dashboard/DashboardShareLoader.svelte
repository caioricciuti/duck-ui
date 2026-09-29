<script lang="ts">
  import { Eye, Pencil } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Modal from '../common/Modal.svelte'
  import { duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { generateUUID } from '@/lib/utils'
  import { createDashboard as newDashboardModel } from '@/services/dashboard/types'
  import { parseDashboardSource } from '@/services/dashboard/markdown'
  import {
    clearDashboardShareHash,
    decodeDashboardShare,
    subscribeToDashboardShares,
    type DashboardSharePayload,
  } from '@/services/dashboard/share'
  import { formatRefreshInterval, parseRefreshParam } from '@/services/dashboard/refresh'
  import { saveDashboard } from '@/services/persistence/repositories/dashboardRepository'

  /**
   * Receives dashboard share links.
   *
   * Mounted once, watches `#dash=`. Nothing imports and nothing runs until the
   * person confirms: the dialog says what the document is, how many queries it
   * declares, and which role the link carries. The same consent rule every
   * other inbound link in Duck-UI follows.
   */
  let payload = $state<DashboardSharePayload | null>(null)
  // `&refresh=N` beside `dash=`, read with the share, before the hash clears.
  let refreshSeconds = $state<number | null>(null)
  let importing = $state(false)

  const queryCount = $derived(payload ? parseDashboardSource(payload.source).queries.length : 0)
  const isViewer = $derived(payload?.mode === 'viewer')

  $effect(() => {
    let cancelled = false
    const unsubscribe = subscribeToDashboardShares((encoded) => {
      void decodeDashboardShare(encoded).then((decoded) => {
        if (cancelled) return
        if (!decoded) {
          toast.error('That dashboard link is not readable')
          clearDashboardShareHash()
          return
        }
        refreshSeconds = parseRefreshParam(window.location.hash)
        payload = decoded
      })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  })

  function dismiss() {
    clearDashboardShareHash()
    payload = null
  }

  async function open() {
    if (!payload) return
    const { currentProfileId, currentConnection, loadDashboards, openDashboardTab } = duckActions()
    if (!currentProfileId) {
      toast.error('Create a profile first')
      return
    }
    importing = true
    try {
      const dashboard = {
        ...newDashboardModel(payload.name, generateUUID(), new Date().toISOString()),
        source: payload.source,
        // Shared documents run on the RECIPIENT's engine against data reachable
        // from their browser. Never against the sender's.
        execution: { mode: 'local' as const, connectionId: currentConnection?.id ?? 'WASM' },
        role: payload.mode,
        refreshIntervalSeconds: refreshSeconds || undefined,
      }
      await saveDashboard(currentProfileId, dashboard)
      await loadDashboards()
      openDashboardTab(dashboard.id, dashboard.name)
      dismiss()
    } catch (error) {
      console.warn('[dashboard] failed to import a shared dashboard:', error)
      toast.error('Could not open the shared dashboard')
    } finally {
      importing = false
    }
  }
</script>

{#if payload}
  <Modal open onclose={dismiss} size="sm" title="Open “{payload.name}”">
    <div class="flex flex-col gap-3">
      <p class="flex items-center gap-1.5 text-[13px] text-fg-2">
        {#if isViewer}<Eye size={13} />{:else}<Pencil size={13} />{/if}
        <span>
          Shared {isViewer ? 'read-only' : 'as editable'} · {queryCount}
          {queryCount === 1 ? 'query' : 'queries'}{refreshSeconds
            ? ` · refreshes every ${formatRefreshInterval(refreshSeconds)}`
            : ''}
        </span>
      </p>
      <p class="text-xs text-fg-3">
        The queries run in your browser, against data your browser can reach. Nothing runs until
        you open it.
      </p>
    </div>

    {#snippet footer()}
      <Button size="sm" variant="ghost" onclick={dismiss}>Not now</Button>
      <Button size="sm" onclick={open} disabled={importing}>Open</Button>
    {/snippet}
  </Modal>
{/if}
