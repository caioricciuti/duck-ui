<script lang="ts">
  import { Download, Upload } from 'lucide-svelte'
  import { downloadProjectExport } from '@/services/projectTransfer'
  import Button from '../common/Button.svelte'
  import SectionHeader from '../common/SectionHeader.svelte'
  import { duck } from '../../stores/duck.svelte'
  import ProjectImportDialog from './ProjectImportDialog.svelte'

  const currentProfileId = $derived(duck((s) => s.currentProfileId))

  let inputEl = $state<HTMLInputElement | null>(null)
  let importFile = $state<File | null>(null)
  let exporting = $state(false)

  async function exportProject() {
    if (!currentProfileId) return
    exporting = true
    try {
      await downloadProjectExport(currentProfileId)
    } finally {
      exporting = false
    }
  }

  function pickFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    // Reset so choosing the same file again still fires a change.
    e.currentTarget.value = ''
    if (file) importFile = file
  }
</script>

<section>
  <SectionHeader title="Project files" />
  <p class="mb-3 max-w-[64ch] text-xs leading-relaxed text-fg-3">
    Export saved queries, notebooks and dashboards as a zip of plain
    <code class="rounded-sm bg-surface-2 px-1 font-mono text-fg-2">.sql</code> and
    <code class="rounded-sm bg-surface-2 px-1 font-mono text-fg-2">.md</code> files you can commit to git. Connections,
    credentials and AI settings are never included. Importing merges by id, then by name, and shows what will change
    first.
  </p>
  <div class="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" disabled={!currentProfileId} loading={exporting} onclick={exportProject}>
      <Download size={14} />
      Export project
    </Button>
    <Button size="sm" variant="outline" disabled={!currentProfileId} onclick={() => inputEl?.click()}>
      <Upload size={14} />
      Import project
    </Button>
  </div>
  <input
    bind:this={inputEl}
    type="file"
    accept=".zip,application/zip"
    class="hidden"
    aria-label="Project zip file"
    tabindex="-1"
    onchange={pickFile}
  />
</section>

<ProjectImportDialog file={importFile} onclose={() => (importFile = null)} />
