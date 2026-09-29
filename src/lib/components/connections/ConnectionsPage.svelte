<script lang="ts">
  import { Plus } from 'lucide-svelte'
  import { generateUUID } from '@/lib/utils'
  import Button from '../common/Button.svelte'
  import Panel from '../common/Panel.svelte'
  import PageHeader from '../common/PageHeader.svelte'
  import PageBody from '../common/PageBody.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import ConnectionForm from './ConnectionForm.svelte'
  import ConnectionsList from './ConnectionsList.svelte'
  import { toConnectionProvider, valuesFromConnection, type ConnectionFormValues } from './connectionSchema'

  const connections = $derived(duck((s) => s.connectionList.connections))
  const currentConnectionId = $derived(duck((s) => s.currentConnection?.id))
  const connecting = $derived(duck((s) => s.isLoadingExternalConnection))
  const loading = $derived(duck((s) => s.isLoading))

  let adding = $state(false)
  let editingId = $state<string | null>(null)
  let editingValues = $state<ConnectionFormValues | undefined>(undefined)

  async function addConnection(values: ConnectionFormValues) {
    await duckActions().addConnection(toConnectionProvider(values, generateUUID()))
  }

  async function updateConnection(values: ConnectionFormValues) {
    if (!editingId) return
    await duckActions().updateConnection(toConnectionProvider(values, editingId))
  }

  async function connect(connectionId: string) {
    try {
      await duckActions().setCurrentConnection(connectionId)
    } catch (error) {
      console.error('Failed to connect:', error)
    }
  }

  function edit(connectionId: string) {
    const connection = duckActions().getConnection(connectionId)
    if (!connection) return
    editingValues = valuesFromConnection(connection)
    editingId = connectionId
  }

  function closeEdit() {
    editingId = null
    editingValues = undefined
  }
</script>

<PageHeader title="Connections" subtitle="DuckDB servers and browser databases this profile can query">
  {#snippet actions()}
    <Button size="sm" disabled={connecting} onclick={() => (adding = true)}>
      <Plus size={14} />
      Add connection
    </Button>
  {/snippet}
</PageHeader>

<PageBody>
  <Panel title="Available connections" description="Every connection configured for this profile" padding="none">
    <div class="pt-3">
      <ConnectionsList
        {connections}
        {currentConnectionId}
        {loading}
        onconnect={connect}
        onedit={edit}
        ondelete={(id) => duckActions().deleteConnection(id)}
      />
    </div>
  </Panel>
</PageBody>

<ConnectionForm open={adding} onsubmit={addConnection} onclose={() => (adding = false)} />

<ConnectionForm
  open={editingId !== null}
  editMode
  initialValues={editingValues}
  onsubmit={updateConnection}
  onclose={closeEdit}
/>
