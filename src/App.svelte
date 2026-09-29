<script lang="ts">
  import Toast from './lib/components/common/Toast.svelte'
  import Spinner from './lib/components/common/Spinner.svelte'
  import { getTheme } from './lib/stores/theme.svelte'
  import logoDark from './assets/logo.png'
  import logoLight from './assets/logo-light.png'

  const logo = $derived(getTheme() === 'dark' ? logoDark : logoLight)
</script>

<Toast />

<div class="flex flex-col items-center justify-center h-full gap-3">
  <img src={logo} alt="Duck-UI" class="h-12 w-auto" />
  <Spinner size="lg" />
  <p class="text-xs text-fg-3">Loading Duck-UI workspace...</p>
</div>
