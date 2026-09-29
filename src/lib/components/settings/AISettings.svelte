<script lang="ts">
  import {
    AlertCircle, Check, ChevronDown, Cloud, Cpu, Download, Eye, EyeOff, FlaskConical,
    HardDrive, Key, RefreshCw, Server, Trash2,
  } from 'lucide-svelte'
  import type { AIProviderType } from '@/store/types'
  import { AVAILABLE_MODELS } from '@/lib/duckBrain'
  import { OPENAI_MODELS, ANTHROPIC_MODELS } from '@/lib/duckBrain/providers/types'
  import Badge from '../common/Badge.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Panel from '../common/Panel.svelte'
  import Select from '../common/Select.svelte'
  import Spinner from '../common/Spinner.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'

  /*
    AI provider configuration, as a Settings section.

    The ranking is deliberate: a local OpenAI-compatible server (Ollama,
    LM Studio) is the flagship "private" option, because it runs real models at
    native speed with the same privacy story in-browser inference promises but
    cannot deliver. WebLLM survives as the explicitly experimental zero-install
    path at the bottom.
  */

  type CloudProvider = 'openai' | 'anthropic'

  /** One-click base URLs for the servers people actually run. */
  const LOCAL_PRESETS = [
    { label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
    { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  ]
  const DEFAULT_CLOUD_MODEL: Record<CloudProvider, string> = {
    openai: 'gpt-5-mini',
    anthropic: 'claude-sonnet-5',
  }
  const CLOUD_LABEL: Record<CloudProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic' }

  const providers: { value: AIProviderType; label: string; icon: typeof Server }[] = [
    { value: 'openai-compatible', label: 'Local server (Ollama)', icon: Server },
    { value: 'openai', label: 'OpenAI', icon: Cloud },
    { value: 'anthropic', label: 'Anthropic', icon: Cloud },
    { value: 'webllm', label: 'In-browser (experimental)', icon: FlaskConical },
  ]

  const brain = $derived(duck((s) => s.duckBrain))
  const aiProvider = $derived<AIProviderType>(brain.aiProvider ?? 'openai-compatible')
  const providerConfigs = $derived(brain.providerConfigs ?? {})
  const compatible = $derived(providerConfigs['openai-compatible'])
  const cloudProvider = $derived<CloudProvider | null>(
    aiProvider === 'openai' || aiProvider === 'anthropic' ? aiProvider : null,
  )
  const isDownloading = $derived(brain.modelStatus === 'downloading' || brain.modelStatus === 'loading')

  // Fields start from what is saved and are then owned by the form.
  const saved = duckActions().duckBrain.providerConfigs ?? {}
  let baseUrl = $state(saved['openai-compatible']?.baseUrl ?? LOCAL_PRESETS[0].baseUrl)
  let modelId = $state(saved['openai-compatible']?.modelId ?? '')
  let compatibleKey = $state(saved['openai-compatible']?.apiKey ?? '')
  let foundModels = $state<string[] | null>(null)
  let listing = $state(false)
  let testing = $state(false)
  let showKey = $state<Record<string, boolean>>({})
  let apiKeys = $state<Record<CloudProvider, string>>({
    openai: saved.openai?.apiKey ?? '',
    anthropic: saved.anthropic?.apiKey ?? '',
  })
  let webllmOpen = $state(duckActions().duckBrain.aiProvider === 'webllm')
  let clearing = $state(false)

  // In-browser models: collapsed unless it is the active choice.
  const webllmExpanded = $derived(webllmOpen || aiProvider === 'webllm')

  async function findModels() {
    if (!baseUrl) return
    listing = true
    foundModels = null
    try {
      const { listCompatibleModels } = await import('@/lib/duckBrain/providers')
      const result = await listCompatibleModels(baseUrl, compatibleKey || undefined)
      if (result.models.length > 0) {
        foundModels = result.models
        if (!modelId || !result.models.includes(modelId)) modelId = result.models[0]
        toast.success(`Found ${result.models.length} model${result.models.length === 1 ? '' : 's'}`)
      } else {
        foundModels = []
        toast.error(
          result.error ? `Couldn't list models: ${result.error}` : 'The server answered but offers no models',
        )
      }
    } finally {
      listing = false
    }
  }

  async function saveCompatible() {
    if (!baseUrl || !modelId) {
      toast.error('A base URL and a model are both needed')
      return
    }
    testing = true
    try {
      const { testProviderConnection } = await import('@/lib/duckBrain/providers')
      const config = { baseUrl, modelId, apiKey: compatibleKey || undefined }
      const result = await testProviderConnection('openai-compatible', config)
      if (result.success) {
        duckActions().updateProviderConfig('openai-compatible', config)
        duckActions().setAIProvider('openai-compatible')
        toast.success(`Connected. Duck Brain now uses ${modelId}.`)
      } else {
        toast.error(`Connection failed: ${result.error ?? 'unknown error'}`)
      }
    } finally {
      testing = false
    }
  }

  async function saveCloudKey(provider: CloudProvider) {
    const apiKey = apiKeys[provider]
    if (!apiKey) {
      toast.error('Enter an API key first')
      return
    }
    const model = providerConfigs[provider]?.modelId || DEFAULT_CLOUD_MODEL[provider]
    duckActions().updateProviderConfig(provider, { apiKey, modelId: model })

    testing = true
    try {
      const { testProviderConnection } = await import('@/lib/duckBrain/providers')
      const result = await testProviderConnection(provider, { apiKey, modelId: model })
      if (result.success) {
        duckActions().setAIProvider(provider)
        toast.success(`${CLOUD_LABEL[provider]} key verified`)
      } else {
        toast.error(`Connection failed: ${result.error}`)
      }
    } catch {
      toast.success('API key saved')
    } finally {
      testing = false
    }
  }

  function changeCloudModel(provider: CloudProvider, value: string) {
    duckActions().updateProviderConfig(provider, {
      apiKey: providerConfigs[provider]?.apiKey || '',
      modelId: value,
    })
  }

  async function loadWebllmModel(id: string) {
    duckActions().setAIProvider('webllm')
    await duckActions().initializeDuckBrain(id)
  }

  async function clearWebllmCache() {
    clearing = true
    try {
      const databases = await indexedDB.databases()
      let cleared = 0
      for (const db of databases) {
        if (db.name && /webllm|mlc|cache|model/.test(db.name)) {
          indexedDB.deleteDatabase(db.name)
          cleared++
        }
      }
      if ('caches' in window) {
        for (const name of await caches.keys()) {
          if (/webllm|mlc|model/.test(name)) {
            await caches.delete(name)
            cleared++
          }
        }
      }
      toast.success(cleared > 0 ? `Cleared ${cleared} cached items. Reload to finish.` : 'No cached model data.')
    } catch {
      toast.error("Couldn't clear the cache. Try your browser's site-data settings.")
    } finally {
      clearing = false
    }
  }

  const labelClass = 'mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-2'
  const noteClass = 'flex gap-2 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-fg-2'
</script>

{#snippet keyToggle(id: string)}
  <button
    type="button"
    class="absolute inset-y-0 right-0 inline-flex w-8 items-center justify-center rounded-md text-fg-3 hover:text-fg"
    aria-label={showKey[id] ? 'Hide API key' : 'Show API key'}
    aria-pressed={!!showKey[id]}
    onclick={() => (showKey[id] = !showKey[id])}
  >
    {#if showKey[id]}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
  </button>
{/snippet}

<div class="flex flex-col gap-4">
  <Panel
    title="Duck Brain provider"
    description="Where &quot;question in, SQL out&quot; actually runs. A local server keeps everything on your machine with real model quality."
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2" role="group" aria-label="AI provider">
        {#each providers as provider (provider.value)}
          <Button
            size="sm"
            variant={aiProvider === provider.value ? 'primary' : 'outline'}
            aria-pressed={aiProvider === provider.value}
            onclick={() => duckActions().setAIProvider(provider.value)}
          >
            <provider.icon size={14} />
            {provider.label}
          </Button>
        {/each}
      </div>

      {#if aiProvider === 'openai-compatible'}
        <div class="flex flex-col gap-4">
          <div class={noteClass}>
            <Server size={14} class="mt-0.5 shrink-0 text-fg-3" />
            <p>
              Any OpenAI-compatible endpoint works: Ollama and LM Studio locally, or vLLM, DeepSeek and friends
              remotely. Nothing but the endpoint you set ever sees your prompts.
            </p>
          </div>

          <div>
            <label class={labelClass} for="ai-base-url">Server</label>
            <div class="mb-2 flex flex-wrap gap-2">
              {#each LOCAL_PRESETS as preset (preset.label)}
                <Button
                  size="xs"
                  variant={baseUrl === preset.baseUrl ? 'secondary' : 'outline'}
                  aria-pressed={baseUrl === preset.baseUrl}
                  onclick={() => {
                    baseUrl = preset.baseUrl
                    foundModels = null
                  }}
                >
                  {preset.label}
                </Button>
              {/each}
            </div>
            <Input
              id="ai-base-url"
              type="url"
              bind:value={baseUrl}
              placeholder="http://localhost:11434/v1"
              autocomplete="off"
              spellcheck={false}
              oninput={() => (foundModels = null)}
            />
          </div>

          <div>
            <div class="flex items-center justify-between">
              <label class={labelClass} for="ai-model-id">Model</label>
              <Button size="xs" variant="ghost" disabled={!baseUrl} loading={listing} onclick={findModels}>
                {#if !listing}<RefreshCw size={12} />{/if}
                Find models
              </Button>
            </div>
            {#if foundModels && foundModels.length > 0}
              <Select
                id="ai-model-id"
                bind:value={modelId}
                placeholder="Pick a model"
                options={foundModels.map((model) => ({ value: model, label: model }))}
              />
            {:else}
              <Input
                id="ai-model-id"
                bind:value={modelId}
                placeholder="llama3.2, qwen2.5-coder, ..."
                autocomplete="off"
                spellcheck={false}
              />
            {/if}
          </div>

          <div>
            <label class={labelClass} for="ai-compat-key">
              <Key size={13} class="text-fg-3" />
              API key <span class="font-normal text-fg-3">(optional)</span>
            </label>
            <div class="relative">
              <Input
                id="ai-compat-key"
                type={showKey.compatible ? 'text' : 'password'}
                bind:value={compatibleKey}
                placeholder="Only if the server requires one"
                autocomplete="off"
                class="pr-8"
              />
              {@render keyToggle('compatible')}
            </div>
          </div>

          <Button class="w-full" disabled={!baseUrl || !modelId} loading={testing} onclick={saveCompatible}>
            {testing ? 'Testing connection...' : 'Test & save'}
          </Button>

          {#if compatible?.baseUrl && compatible?.modelId}
            <div>
              <Badge tone="success">
                <Check size={11} />
                Using {compatible.modelId}
              </Badge>
            </div>
          {/if}

          <p class="text-xs leading-relaxed text-fg-3">
            Ollama blocks unknown browser origins by default. If the connection fails from a deployed Duck-UI, start
            it with
            <code class="rounded-sm bg-surface-2 px-1 font-mono text-fg-2">OLLAMA_ORIGINS=https://duckui.com</code>
            (or your own origin). localhost works out of the box.
          </p>
        </div>
      {/if}

      {#if cloudProvider}
        {@const provider = cloudProvider}
        <div class="flex flex-col gap-4">
          <div>
            <label class={labelClass} for="{provider}-key">
              <Key size={13} class="text-fg-3" />
              {CLOUD_LABEL[provider]} API key
            </label>
            <div class="flex gap-2">
              <div class="relative min-w-0 flex-1">
                <Input
                  id="{provider}-key"
                  type={showKey[provider] ? 'text' : 'password'}
                  bind:value={apiKeys[provider]}
                  placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                  autocomplete="off"
                  class="pr-8"
                />
                {@render keyToggle(provider)}
              </div>
              <Button disabled={!apiKeys[provider]} loading={testing} onclick={() => saveCloudKey(provider)}>
                Save
              </Button>
            </div>
            <p class="mt-1 text-xs text-fg-3">
              Stored encrypted on this device, sent only to
              {provider === 'openai' ? 'api.openai.com' : 'api.anthropic.com'}.
            </p>
          </div>

          <div>
            <label class={labelClass} for="{provider}-model">Model</label>
            <Select
              id="{provider}-model"
              value={providerConfigs[provider]?.modelId || DEFAULT_CLOUD_MODEL[provider]}
              options={(provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS).map((model) => ({
                value: model.id,
                label: `${model.name} - ${model.description ?? ''}`,
              }))}
              onchange={(value) => changeCloudModel(provider, value)}
            />
          </div>

          {#if providerConfigs[provider]?.apiKey}
            <div>
              <Badge tone="success">
                <Check size={11} />
                API key configured
              </Badge>
            </div>
          {/if}
        </div>
      {/if}

      {#if aiProvider === 'webllm'}
        <div class={noteClass}>
          <FlaskConical size={14} class="mt-0.5 shrink-0 text-fg-3" />
          <p>
            <strong class="font-semibold text-fg">Experimental.</strong> Small models running inside this tab via
            WebGPU: a gigabyte-plus download, short context, and noticeably weaker SQL than a local Ollama. Its one
            real advantage is needing nothing installed, including offline.
          </p>
        </div>
      {/if}
    </div>
  </Panel>

  <section class="rounded-lg border border-edge-subtle bg-surface">
    <button
      type="button"
      class="flex w-full items-start justify-between gap-3 p-4 text-left"
      aria-expanded={webllmExpanded}
      aria-controls="webllm-models"
      onclick={() => (webllmOpen = !webllmExpanded)}
    >
      <span class="min-w-0">
        <span class="flex items-center gap-2 text-[13px] font-semibold text-fg">
          <FlaskConical size={14} class="text-fg-3" />
          In-browser models (experimental)
        </span>
        <span class="mt-0.5 block text-xs text-fg-3">
          Zero-install, works offline. Weak at SQL, prefer a local server if you can run one.
        </span>
      </span>
      <ChevronDown size={14} class="mt-0.5 shrink-0 text-fg-3 transition-transform {webllmExpanded ? 'rotate-180' : ''}" />
    </button>

    {#if webllmExpanded}
      <div id="webllm-models" class="flex flex-col gap-4 px-4 pb-4">
        {#if brain.isWebGPUSupported === false}
          <div class="flex gap-2 rounded-md bg-danger-soft p-3 text-xs text-danger" role="alert">
            <AlertCircle size={14} class="mt-0.5 shrink-0" />
            <p>This browser has no WebGPU, which in-browser models require. Every other provider still works.</p>
          </div>
        {/if}

        {#if isDownloading}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-[13px]">
              <span class="flex items-center gap-2 text-fg-2">
                <Spinner size="sm" class="text-accent" />
                {brain.modelStatus === 'downloading' ? 'Downloading model...' : 'Loading model...'}
              </span>
              <span class="tabular-nums text-fg-3">{brain.downloadProgress}%</span>
            </div>
            <div
              class="h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label="Model download progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={brain.downloadProgress}
            >
              <div class="h-full rounded-full bg-accent transition-[width]" style="width:{Math.max(0, Math.min(100, brain.downloadProgress))}%"></div>
            </div>
            <p class="text-xs text-fg-3">{brain.downloadStatus}</p>
          </div>
        {/if}

        {#if brain.modelStatus === 'error' && brain.error && aiProvider === 'webllm'}
          <div class="flex gap-2 rounded-md bg-danger-soft p-3 text-xs text-danger" role="alert">
            <AlertCircle size={14} class="mt-0.5 shrink-0" />
            <p>{brain.error}</p>
          </div>
        {/if}

        <ul class="flex flex-col gap-2">
          {#each AVAILABLE_MODELS as model (model.id)}
            {@const isActive = brain.currentModel === model.id && brain.modelStatus === 'ready'}
            {@const isLoadingThis = isDownloading && brain.currentModel === model.id}
            <li class="flex items-start justify-between gap-3 rounded-md border p-3 {isActive ? 'border-success bg-success-soft' : 'border-edge-subtle'}">
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <Cpu size={14} class="text-fg-3" />
                  <span class="text-[13px] font-medium text-fg">{model.displayName}</span>
                  {#if isActive}
                    <Badge tone="success">
                      <Check size={11} />
                      Active
                    </Badge>
                  {/if}
                </div>
                <p class="text-xs text-fg-3">{model.description}</p>
                <div class="flex items-center gap-3 text-xs text-fg-3">
                  <span class="flex items-center gap-1">
                    <HardDrive size={12} />
                    {model.size}
                  </span>
                  <span>Context: {model.contextLength.toLocaleString()} tokens</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={isActive || isDownloading || brain.isWebGPUSupported === false}
                loading={isLoadingThis}
                aria-label={isActive ? 'Model loaded' : isLoadingThis ? 'Loading model' : `Load ${model.displayName}`}
                onclick={() => loadWebllmModel(model.id)}
              >
                {#if isActive}
                  <Check size={14} />
                {:else if !isLoadingThis}
                  <Download size={14} />
                  Load
                {/if}
              </Button>
            </li>
          {/each}
        </ul>

        <div class="flex items-center justify-between gap-3 border-t border-edge-subtle pt-3">
          <p class="text-xs text-fg-3">Models cache in this browser's storage.</p>
          <Button size="sm" variant="outline" loading={clearing} onclick={clearWebllmCache}>
            {#if !clearing}<Trash2 size={14} />{/if}
            Clear cache
          </Button>
        </div>
      </div>
    {/if}
  </section>
</div>
