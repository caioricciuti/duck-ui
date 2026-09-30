<script lang="ts">
  import { getTheme } from '../../stores/theme.svelte'
  import logoDark from '../../../assets/logo.png'
  import logoLight from '../../../assets/logo-light.png'

  interface Props {
    avatarEmoji: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    class?: string
  }

  let { avatarEmoji, size = 'md', class: cls = '' }: Props = $props()

  const sizes: Record<string, { img: string; text: string }> = {
    sm: { img: 'h-4', text: 'text-sm leading-none' },
    md: { img: 'h-6', text: 'text-lg leading-none' },
    lg: { img: 'h-10', text: 'text-3xl leading-none' },
    xl: { img: 'h-14', text: 'text-5xl leading-none' },
  }
</script>

{#if avatarEmoji === 'logo'}
  <img src={getTheme() === 'dark' ? logoDark : logoLight} alt="Duck-UI" class="{sizes[size].img} w-auto {cls}" />
{:else}
  <span class="{sizes[size].text} {cls}">{avatarEmoji}</span>
{/if}
