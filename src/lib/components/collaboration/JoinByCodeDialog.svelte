<script lang="ts">
  import Sheet from '../common/Sheet.svelte'
  import Button from '../common/Button.svelte'
  import Textarea from '../common/Textarea.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { buildInviteUrl, decodeInvite, type ManualInvite } from '@/services/collaboration/signaling/manualSignaling'

  interface Props {
    open: boolean
    onclose: () => void
  }

  /*
   * Joining from a pasted invite, rather than from a link.
   *
   * An invite normally travels as a URL, but the fragment that carries it can
   * be stripped by whatever passed it along, leaving someone on a bare Duck-UI
   * with no way in. Accepting the raw code makes the flow robust against that
   * without moving the payload into a query string, where it would end up in
   * server logs.
   *
   * Deliberately thin: it validates the code and puts it in the URL, so the
   * normal join dialog picks it up and runs exactly the flow a link would.
   */
  let { open, onclose }: Props = $props()

  const uid = $props.id()
  let code = $state('')
  let checking = $state(false)

  async function join() {
    const trimmed = code.trim()
    if (!trimmed) return

    checking = true
    try {
      // Accept either the whole link or just the code. People paste both.
      const fromUrl = trimmed.includes('#live=') ? (trimmed.split('#live=')[1] ?? '').split('&')[0] : trimmed

      const invite = await decodeInvite<ManualInvite>(fromUrl)
      if (!invite || !('offer' in invite)) {
        toast.error("That code isn't readable. Ask for a fresh invite")
        return
      }

      onclose()
      code = ''
      // Assigning the hash raises `hashchange`, which the join dialog watches.
      window.location.hash = buildInviteUrl(fromUrl).split('#')[1] ?? ''
    } finally {
      checking = false
    }
  }
</script>

<Sheet
  {open}
  {onclose}
  title="Join with an invite code"
  description="Paste the link or the code someone sent you. Nothing runs until you confirm."
>
  <label class="sr-only" for="{uid}-code">Invite link or code</label>
  <Textarea id="{uid}-code" mono rows={5} bind:value={code} placeholder="Paste the invite link or code" />

  {#snippet footer()}
    <Button variant="ghost" onclick={onclose}>Cancel</Button>
    <Button onclick={join} disabled={!code.trim()} loading={checking}>Continue</Button>
  {/snippet}
</Sheet>
