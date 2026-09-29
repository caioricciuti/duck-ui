<script lang="ts">
  import { Monitor, Moon, Sun } from 'lucide-svelte'
  import { setSetting } from '@/services/persistence/repositories/settingsRepository'
  import SectionHeader from '../common/SectionHeader.svelte'
  import { duckActions } from '../../stores/duck.svelte'
  import { getThemeMode, setThemeMode, type ThemeMode } from '../../stores/theme.svelte'

  const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  const mode = $derived(getThemeMode())

  async function changeTheme(value: ThemeMode) {
    setThemeMode(value)
    const { currentProfileId } = duckActions()
    if (!currentProfileId) return
    try {
      await setSetting(currentProfileId, 'theme', 'mode', JSON.stringify(value))
    } catch {
      // Non-critical, theme still applied in-memory
    }
  }
</script>

<section>
  <SectionHeader title="Theme" description="System follows the appearance set in your operating system." />
  <div class="flex flex-col gap-2" role="radiogroup" aria-label="Theme">
    {#each options as option (option.value)}
      <label class="inline-flex items-center gap-2 text-[13px] text-fg-2 select-none" for="theme-{option.value}">
        <input
          id="theme-{option.value}"
          type="radio"
          name="theme-mode"
          class="ds-radio"
          value={option.value}
          checked={mode === option.value}
          onchange={() => changeTheme(option.value)}
        />
        <option.icon size={14} class="text-fg-3" />
        {option.label}
      </label>
    {/each}
  </div>
</section>
