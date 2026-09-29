<script lang="ts">
  import type { Snippet } from 'svelte'
  import { AlertCircle, Brain, Cloud, Download, RefreshCw, Trash2, X } from 'lucide-svelte'
  import Badge from '../common/Badge.svelte'
  import Button from '../common/Button.svelte'
  import Select from '../common/Select.svelte'
  import Spinner from '../common/Spinner.svelte'
  import DuckBrainMessages from './DuckBrainMessages.svelte'
  import DuckBrainInput from './DuckBrainInput.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import type { AIProviderType } from '@/store'
  import { getUiConfig } from '@/lib/appConfig'
  import { AVAILABLE_MODELS, DEFAULT_MODEL } from '@/lib/duckBrain'
  import { OPENAI_MODELS, ANTHROPIC_MODELS } from '@/lib/duckBrain/providers/types'
  import { formatSchemaForContext } from '@/lib/duckBrain/schemaFormatter'
  import { TEXT_TO_SQL_SYSTEM_PROMPT, DUCKDB_FEW_SHOT_EXAMPLES } from '@/lib/duckBrain/prompts/text-to-sql'
  import { estimateTokens } from '@/lib/duckBrain/tokenEstimate'

  interface Props {
    /** Id of the SQL tab under the sheet, or '' when the active tab is not a SQL tab. */
    tabId: string
    /** Id of the heading, so the sheet can label its dialog with it. */
    titleId?: string
  }

  let { tabId, titleId }: Props = $props()

  // One derived per field: a streamed token replaces the `duckBrain` object,
  // and only what reads `streamingContent` should update for it.
  const modelStatus = $derived(duck((s) => s.duckBrain.modelStatus))
  const downloadProgress = $derived(duck((s) => s.duckBrain.downloadProgress))
  const downloadStatus = $derived(duck((s) => s.duckBrain.downloadStatus))
  const isWebGPUSupported = $derived(duck((s) => s.duckBrain.isWebGPUSupported))
  const currentModel = $derived(duck((s) => s.duckBrain.currentModel))
  const error = $derived(duck((s) => s.duckBrain.error))
  const messages = $derived(duck((s) => s.duckBrain.messages))
  const isGenerating = $derived(duck((s) => s.duckBrain.isGenerating))
  const streamingContent = $derived(duck((s) => s.duckBrain.streamingContent))
  const aiProvider = $derived(duck((s) => s.duckBrain.aiProvider ?? 'webllm'))
  const providerConfigs = $derived(duck((s) => s.duckBrain.providerConfigs ?? {}))
  const databases = $derived(duck((s) => s.databases))

  const localModelName = $derived(AVAILABLE_MODELS.find((m) => m.id === currentModel)?.displayName)

  // Display name for the current provider and model.
  const providerDisplayInfo = $derived.by(() => {
    if (aiProvider === 'openai') {
      const config = providerConfigs.openai
      if (config?.apiKey) {
        const model = OPENAI_MODELS.find((m) => m.id === config.modelId)
        return { name: model?.name || 'GPT-4o Mini', isCloud: true }
      }
    } else if (aiProvider === 'anthropic') {
      const config = providerConfigs.anthropic
      if (config?.apiKey) {
        const model = ANTHROPIC_MODELS.find((m) => m.id === config.modelId)
        return { name: model?.name || 'Claude Sonnet 4', isCloud: true }
      }
    } else if (aiProvider === 'openai-compatible') {
      const config = providerConfigs['openai-compatible']
      if (config?.baseUrl && config?.modelId) {
        return { name: config.modelId, isCloud: true }
      }
    }
    // In-browser model, or nothing configured yet.
    return { name: localModelName || 'Not configured', isCloud: false }
  })

  // Providers that can be picked in the chat: only the ones that are set up.
  const availableProviders = $derived.by(() => {
    const providers: { value: AIProviderType; label: string }[] = []

    if (modelStatus === 'ready' || modelStatus === 'downloading' || modelStatus === 'loading') {
      providers.push({ value: 'webllm', label: localModelName || 'Local Model' })
    }
    if (providerConfigs.openai?.apiKey) {
      const model = OPENAI_MODELS.find((m) => m.id === providerConfigs.openai?.modelId)
      providers.push({ value: 'openai', label: model?.name || 'GPT-4o Mini' })
    }
    if (providerConfigs.anthropic?.apiKey) {
      const model = ANTHROPIC_MODELS.find((m) => m.id === providerConfigs.anthropic?.modelId)
      providers.push({ value: 'anthropic', label: model?.name || 'Claude Sonnet 4' })
    }
    const compatible = providerConfigs['openai-compatible']
    if (compatible?.baseUrl && compatible?.modelId) {
      providers.push({ value: 'openai-compatible', label: compatible.modelId })
    }
    return providers
  })

  // Models switchable in-chat for the active provider (promised in #23).
  const switchableModels = $derived(
    aiProvider === 'openai' ? OPENAI_MODELS : aiProvider === 'anthropic' ? ANTHROPIC_MODELS : null,
  )

  const activeModelId = $derived(
    aiProvider === 'openai' || aiProvider === 'anthropic'
      ? providerConfigs[aiProvider]?.modelId || switchableModels?.[0]?.id
      : undefined,
  )

  const hasExternalProvider = $derived(
    Boolean(
      (aiProvider === 'openai' && providerConfigs.openai?.apiKey) ||
        (aiProvider === 'anthropic' && providerConfigs.anthropic?.apiKey) ||
        (aiProvider === 'openai-compatible' &&
          providerConfigs['openai-compatible']?.baseUrl &&
          providerConfigs['openai-compatible']?.modelId),
    ),
  )

  // Everything sent alongside the user's prompt: system prompt, few-shot
  // examples, schema context, and the chat history. Recomputed as those grow
  // so the input can show a pre-run token estimate (#23).
  const baselineTokens = $derived.by(() => {
    const schema = formatSchemaForContext(databases).formatted
    const fewShot = DUCKDB_FEW_SHOT_EXAMPLES.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n')
    const history = messages.map((m) => m.content).join('\n')
    return estimateTokens(`${TEXT_TO_SQL_SYSTEM_PROMPT}\n${schema}\n${fewShot}\n${history}`)
  })

  type View = 'no-webgpu' | 'init-local' | 'not-configured' | 'loading' | 'error' | 'chat'

  const view = $derived.by((): View => {
    // WebGPU only matters for the in-browser provider. Every server-backed
    // provider works fine without it.
    if (isWebGPUSupported === false && aiProvider === 'webllm') return 'no-webgpu'
    // Nothing usable yet. What that means depends on the provider: the
    // in-browser one needs a model download, everything else needs Settings.
    if ((modelStatus === 'idle' || modelStatus === 'checking') && !hasExternalProvider) {
      return aiProvider === 'webllm' ? 'init-local' : 'not-configured'
    }
    if (modelStatus === 'downloading' || modelStatus === 'loading') return 'loading'
    if (modelStatus === 'error') return 'error'
    return 'chat'
  })

  function close() {
    duckActions().toggleBrainPanel()
  }

  function handleModelChange(modelId: string) {
    if (aiProvider !== 'openai' && aiProvider !== 'anthropic') return
    duckActions().updateProviderConfig(aiProvider, { ...providerConfigs[aiProvider], modelId })
  }

  async function handleExecuteSQL(messageId: string, sql: string) {
    try {
      const result = await duckActions().executeQueryInChat(messageId, sql)
      if (result) toast.success(`Query returned ${result.rowCount} rows`)
    } catch {
      // The store already recorded the error, ResultsArtifact shows it.
    }
  }

  function handleInsertSQL(sql: string) {
    duckActions().updateTabQuery(tabId, sql)
    toast.success('SQL inserted into editor')
  }

  function handleOpenInTab(sql: string) {
    duckActions().createTab('sql', sql, 'Duck Brain query')
    // The sheet covers the workspace, close it so the new tab is visible.
    close()
  }

  function handleInitialize() {
    void duckActions().initializeDuckBrain(DEFAULT_MODEL.id)
  }

  function openAISettings() {
    const { tabs, setActiveTab, createTab } = duckActions()
    const existing = tabs.find((tab) => tab.type === 'settings')
    if (existing) setActiveTab(existing.id)
    else createTab('settings', '', 'Settings')
    // The sheet covers the workspace, close it so Settings is visible.
    close()
  }
</script>

{#snippet centered(body: Snippet)}
  <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
    <div class="w-full max-w-sm text-center">
      {@render body()}
    </div>
  </div>
{/snippet}

<div class="flex h-full min-h-0 flex-col bg-elevated text-[13px] text-fg">
  <div class="flex shrink-0 items-center justify-between border-b border-edge-subtle px-3 py-2">
    <div class="flex items-center gap-2">
      <Brain size={16} class="text-accent" />
      <h2 id={titleId} class="text-[13px] font-semibold">Duck Brain</h2>
    </div>
    <div class="flex items-center gap-1">
      {#if view === 'chat' && messages.length > 0}
        <Button icon variant="ghost" size="sm" aria-label="Clear chat" title="Clear chat" onclick={() => duckActions().clearBrainMessages()}>
          <Trash2 size={14} />
        </Button>
      {/if}
      <Button icon variant="ghost" size="sm" aria-label="Close Duck Brain" onclick={close}>
        <X size={15} />
      </Button>
    </div>
  </div>

  {#if view === 'no-webgpu'}
    {#snippet body()}
      <div class="rounded-md border border-danger/40 bg-danger-soft p-3 text-left" role="alert">
        <div class="flex items-start gap-2">
          <AlertCircle size={15} class="mt-0.5 shrink-0 text-danger" />
          <div>
            <p class="font-medium text-danger">WebGPU Not Supported</p>
            <p class="mt-1 text-xs text-fg-2">
              Duck Brain requires WebGPU for local AI processing. Please use Chrome 113+ or Edge 113+.
            </p>
          </div>
        </div>
      </div>
    {/snippet}
    {@render centered(body)}
  {:else if view === 'init-local'}
    {#snippet body()}
      <Brain size={40} class="mx-auto mb-4 text-accent" />
      <h3 class="mb-2 text-sm font-semibold">Initialize Duck Brain</h3>
      <p class="mb-4 text-fg-3">
        Download an AI model to enable natural language to SQL conversion. This runs 100% locally in your browser.
      </p>
      <div class="mb-4 space-y-1.5 text-xs text-fg-3">
        <p><strong class="text-fg-2">Model:</strong> {DEFAULT_MODEL.displayName}</p>
        <p><strong class="text-fg-2">Size:</strong> {DEFAULT_MODEL.size}</p>
        <p>First load downloads the model. Future loads use cache.</p>
      </div>
      <Button onclick={handleInitialize}>
        <Download size={14} />
        Load AI Model
      </Button>
    {/snippet}
    {@render centered(body)}
  {:else if view === 'not-configured'}
    {#snippet body()}
      <Brain size={40} class="mx-auto mb-4 text-accent" />
      <h3 class="mb-2 text-sm font-semibold">No AI configured yet</h3>
      <p class="mb-4 text-fg-3">
        Duck Brain turns questions into SQL. Point it at a local Ollama (private, one click if it's running), or add an
        OpenAI or Anthropic key.
      </p>
      {#if !getUiConfig().hideSettings}
        <Button onclick={openAISettings}>
          <Cloud size={14} />
          Open AI settings
        </Button>
      {/if}
    {/snippet}
    {@render centered(body)}
  {:else if view === 'loading'}
    {#snippet body()}
      <Spinner size="md" class="mx-auto mb-4 text-accent" />
      <h3 class="mb-3 text-sm font-semibold">
        {modelStatus === 'downloading' ? 'Downloading Model...' : 'Loading Model...'}
      </h3>
      <div
        class="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Model download"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(downloadProgress)}
      >
        <div
          class="h-full rounded-full bg-accent transition-[width] duration-200"
          style="width:{Math.max(0, Math.min(100, downloadProgress))}%"
        ></div>
      </div>
      <p class="text-xs text-fg-3">{downloadStatus || `${downloadProgress}%`}</p>
    {/snippet}
    {@render centered(body)}
  {:else if view === 'error'}
    {#snippet body()}
      <AlertCircle size={40} class="mx-auto mb-4 text-danger" />
      <h3 class="mb-2 text-sm font-semibold">Failed to Load Model</h3>
      <p class="mb-4 break-words text-fg-3">{error || 'An unknown error occurred'}</p>
      <Button variant="outline" onclick={handleInitialize}>
        <RefreshCw size={14} />
        Try Again
      </Button>
    {/snippet}
    {@render centered(body)}
  {:else}
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge-subtle px-3 py-1.5">
      <Badge tone="success" dot>Ready</Badge>

      <!-- The provider can be switched here once more than one is set up. -->
      {#if availableProviders.length > 1}
        <label class="sr-only" for="brain-provider">AI provider</label>
        <Select
          id="brain-provider"
          size="sm"
          class="w-auto max-w-[45%]"
          value={aiProvider}
          options={availableProviders}
          onchange={(value) => duckActions().setAIProvider(value as AIProviderType)}
        />
      {:else}
        <div class="flex min-w-0 items-center gap-1.5 text-xs text-fg-3">
          {#if providerDisplayInfo.isCloud}
            <Cloud size={13} class="shrink-0" />
          {/if}
          <span class="truncate">{providerDisplayInfo.name}</span>
        </div>
      {/if}

      <!-- Model switcher for the active cloud provider (#23) -->
      {#if switchableModels && activeModelId}
        <label class="sr-only" for="brain-model">Model</label>
        <Select
          id="brain-model"
          size="sm"
          class="ml-auto w-auto max-w-[45%]"
          value={activeModelId}
          options={switchableModels.map((m) => ({ value: m.id, label: m.name }))}
          onchange={handleModelChange}
        />
      {/if}
    </div>

    <DuckBrainMessages
      {messages}
      {streamingContent}
      generating={isGenerating}
      onexecute={handleExecuteSQL}
      oninsert={tabId ? handleInsertSQL : undefined}
      onopenintab={handleOpenInTab}
    />

    <div class="shrink-0 border-t border-edge-subtle p-3">
      <DuckBrainInput
        onsend={(message) => void duckActions().generateSQL(message)}
        onabort={() => duckActions().abortGeneration()}
        generating={isGenerating}
        disabled={modelStatus !== 'ready' && !hasExternalProvider}
        {databases}
        placeholder="Ask Duck Brain... (@ for tables)"
        {baselineTokens}
      />
    </div>
  {/if}
</div>
