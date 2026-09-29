<script lang="ts">
  import { Database, ExternalLink, Info, Pencil, Radio, Trash2 } from 'lucide-svelte'
  import type { ConnectionProvider } from '@/store/types'
  import Button from '../common/Button.svelte'
  import ConfirmDialog from '../common/ConfirmDialog.svelte'
  import Tooltip from '../common/Tooltip.svelte'

  interface Props {
    connections: ConnectionProvider[]
    currentConnectionId?: string
    loading: boolean
    onconnect: (connectionId: string) => void
    onedit: (connectionId: string) => void
    ondelete: (connectionId: string) => void
  }

  let { connections, currentConnectionId, loading, onconnect, onedit, ondelete }: Props = $props()

  let deleteTarget = $state<ConnectionProvider | null>(null)

  /** Why a connection cannot be edited or deleted, when it cannot. */
  function readOnlyReason(connection: ConnectionProvider): string | null {
    switch (connection.environment) {
      case 'ENV':
        return 'Configured via environment variables, cannot be edited or deleted.'
      case 'BUILT_IN':
        return 'Built-in connection, cannot be edited or deleted.'
      case 'SESSION':
        return 'Granted by a live session. It disappears when the session ends.'
      default:
        return null
    }
  }

  function confirmDelete() {
    if (deleteTarget) ondelete(deleteTarget.id)
    deleteTarget = null
  }
</script>

<!--
  One row per connection. The row knows which environments are read-only and
  says why instead of hiding buttons. The wrapper scrolls sideways so a narrow
  container never clips the right-hand columns.
-->
<div class="ds-table-wrap">
  <table class="ds-table">
    <thead>
      <tr class="ds-table-head-row">
        <th class="ds-table-th">Name</th>
        <th class="ds-table-th">Scope</th>
        <th class="ds-table-th">Host</th>
        <th class="ds-table-th">Database</th>
        <th class="ds-table-th">Environment</th>
        <th class="ds-table-th-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each connections as connection (connection.id)}
        {@const isCurrent = connection.id === currentConnectionId}
        {@const reason = readOnlyReason(connection)}
        <tr class="ds-table-row">
          <td class="ds-td-strong border-l-2 {isCurrent ? 'border-l-success' : 'border-l-transparent'}">
            <div class="flex items-center gap-2 whitespace-nowrap">
              {#if connection.scope === 'WASM' || connection.scope === 'OPFS'}
                <Database size={14} class="shrink-0 text-fg-3" />
              {:else if connection.scope === 'Peer'}
                <Radio size={14} class="shrink-0 text-warning" />
              {:else}
                <ExternalLink size={14} class="shrink-0 text-fg-3" />
              {/if}
              {connection.name}
            </div>
          </td>
          <td class="ds-td">{connection.scope}</td>
          <td class="ds-td-mono">{connection.host || (connection.scope === 'WASM' ? 'Local' : '-')}</td>
          <td class="ds-td">{connection.database || (connection.scope === 'WASM' ? 'memory' : '-')}</td>
          <td class="ds-td">{connection.environment}</td>
          <td class="ds-td">
            <div class="flex items-center justify-end gap-1.5">
              {#if connection.environment !== 'BUILT_IN'}
                <Button size="sm" variant="outline" disabled={isCurrent || loading} onclick={() => onconnect(connection.id)}>
                  {isCurrent ? 'Connected' : 'Connect'}
                </Button>
              {/if}

              {#if reason}
                <Tooltip text={reason} delay={150}>
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:text-fg-2"
                    aria-label={reason}
                  >
                    <Info size={15} />
                  </button>
                </Tooltip>
              {:else}
                <Button
                  icon
                  size="sm"
                  variant="ghost"
                  disabled={connection.id === 'WASM'}
                  aria-label={`Edit ${connection.name}`}
                  onclick={() => onedit(connection.id)}
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  icon
                  size="sm"
                  variant="ghost"
                  disabled={loading}
                  aria-label={`Delete ${connection.name}`}
                  onclick={() => (deleteTarget = connection)}
                >
                  <Trash2 size={14} class="text-danger" />
                </Button>
              {/if}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Delete Connection"
  description={deleteTarget
    ? `Are you sure you want to delete the connection "${deleteTarget.name}"? This action cannot be undone.`
    : ''}
  confirmLabel="Delete"
  destructive
  onconfirm={confirmDelete}
  oncancel={() => (deleteTarget = null)}
/>
