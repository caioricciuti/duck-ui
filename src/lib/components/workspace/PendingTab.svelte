<script lang="ts">
  import { Hammer } from 'lucide-svelte'
  import EmptyState from '../common/EmptyState.svelte'

  interface Props {
    name: string
  }

  let { name }: Props = $props()
</script>

<EmptyState
  icon={Hammer}
  title="{name} is being ported"
  description="This screen has not moved to the new interface yet. Your saved data for it is untouched."
/>
