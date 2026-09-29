<script lang="ts">
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import type { CsvImportOptions } from '@/lib/fileImporter/types'

  type OptionValue = string | boolean | number | undefined

  interface Props {
    /** Unique suffix for the field ids of this file. */
    idSuffix: string
    disabled: boolean
    csvOptions: CsvImportOptions
    onchange: (key: keyof CsvImportOptions, value: OptionValue) => void
  }

  let { idSuffix, disabled, csvOptions, onchange }: Props = $props()

  let showOptions = $state(false)

  const toggles: { key: 'header' | 'autoDetect' | 'ignoreErrors' | 'nullPadding'; label: string }[] = [
    { key: 'header', label: 'Has header row' },
    { key: 'autoDetect', label: 'Auto-detect types' },
    { key: 'ignoreErrors', label: 'Ignore errors' },
    { key: 'nullPadding', label: 'Pad missing columns' },
  ]

  const toCount = (raw: string): number | undefined => parseInt(raw, 10) || undefined
</script>

<div class="mt-3">
  <div class="flex items-center justify-between">
    <h4 class="text-xs font-medium text-fg-2">CSV import options</h4>
    <Button variant="ghost" size="xs" aria-expanded={showOptions} onclick={() => (showOptions = !showOptions)}>
      {showOptions ? 'Hide options' : 'Show options'}
    </Button>
  </div>

  {#if showOptions}
    <div class="mt-2 flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        {#each toggles as toggle (toggle.key)}
          <label class="ds-checkbox-label text-xs">
            <input
              type="checkbox"
              class="ds-checkbox ds-checkbox-sm"
              checked={csvOptions[toggle.key]}
              {disabled}
              onchange={(e) => onchange(toggle.key, e.currentTarget.checked)}
            />
            {toggle.label}
          </label>
        {/each}
      </div>

      <FormField label="Delimiter" for="delimiter-{idSuffix}" hint="Common values: , (comma), ; (semicolon), tab, pipe (|)">
        <Input
          id="delimiter-{idSuffix}"
          size="sm"
          value={csvOptions.delimiter}
          placeholder="Delimiter character"
          {disabled}
          oninput={(e) => onchange('delimiter', e.currentTarget.value)}
        />
      </FormField>

      <div class="flex flex-col gap-3 border-t border-edge-subtle pt-3">
        <h5 class="text-xs font-medium text-fg-3">Advanced options</h5>

        <div class="grid grid-cols-2 gap-3">
          <FormField controlWidth="full" label="Quote character" for="quote-{idSuffix}">
            <Input
              id="quote-{idSuffix}"
              size="sm"
              value={csvOptions.quote ?? ''}
              placeholder={'" (default)'}
              {disabled}
              oninput={(e) => onchange('quote', e.currentTarget.value)}
            />
          </FormField>

          <FormField controlWidth="full" label="Escape character" for="escape-{idSuffix}">
            <Input
              id="escape-{idSuffix}"
              size="sm"
              value={csvOptions.escape ?? ''}
              placeholder={'" (default)'}
              {disabled}
              oninput={(e) => onchange('escape', e.currentTarget.value)}
            />
          </FormField>

          <FormField controlWidth="full" label="Skip rows" for="skip-{idSuffix}">
            <Input
              id="skip-{idSuffix}"
              size="sm"
              type="number"
              min={0}
              value={csvOptions.skip ?? ''}
              placeholder="0"
              {disabled}
              oninput={(e) => onchange('skip', toCount(e.currentTarget.value))}
            />
          </FormField>

          <FormField controlWidth="full" label="Sample size" for="sample-size-{idSuffix}">
            <Input
              id="sample-size-{idSuffix}"
              size="sm"
              type="number"
              min={1}
              value={csvOptions.sampleSize ?? ''}
              placeholder="Auto"
              {disabled}
              oninput={(e) => onchange('sampleSize', toCount(e.currentTarget.value))}
            />
          </FormField>
        </div>

        <FormField
          controlWidth="full"
          label="NULL string"
          for="null-str-{idSuffix}"
          hint="Values matching this string will be treated as NULL"
        >
          <Input
            id="null-str-{idSuffix}"
            size="sm"
            value={csvOptions.nullStr ?? ''}
            placeholder="Empty values treated as NULL"
            {disabled}
            oninput={(e) => onchange('nullStr', e.currentTarget.value)}
          />
        </FormField>

        <div class="grid grid-cols-2 gap-3">
          <FormField controlWidth="full" label="Date format" for="date-format-{idSuffix}">
            <Input
              id="date-format-{idSuffix}"
              size="sm"
              value={csvOptions.dateFormat ?? ''}
              placeholder="ISO 8601"
              {disabled}
              oninput={(e) => onchange('dateFormat', e.currentTarget.value)}
            />
          </FormField>

          <FormField controlWidth="full" label="Timestamp format" for="timestamp-format-{idSuffix}">
            <Input
              id="timestamp-format-{idSuffix}"
              size="sm"
              value={csvOptions.timestampFormat ?? ''}
              placeholder="ISO 8601"
              {disabled}
              oninput={(e) => onchange('timestampFormat', e.currentTarget.value)}
            />
          </FormField>
        </div>
      </div>
    </div>
  {/if}
</div>
