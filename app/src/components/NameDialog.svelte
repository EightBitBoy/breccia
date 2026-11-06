<script lang="ts">
  import { Dialog } from 'bits-ui'

  let {
    title,
    initial,
    onok,
    oncancel,
  }: {
    title: string
    initial: string
    onok: (name: string) => void
    oncancel: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let name = $state(initial)
  let input = $state<HTMLInputElement | null>(null)
  const valid = $derived(name.trim() !== '')

  $effect(() => input?.select())

  function submit(e: SubmitEvent) {
    e.preventDefault()
    if (valid) onok(name.trim())
  }
</script>

<Dialog.Root open onOpenChange={(o) => !o && oncancel()}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content class="dialog" aria-describedby={undefined}>
      <Dialog.Title class="dialog-title">{title}</Dialog.Title>
      <form onsubmit={submit}>
        <input bind:this={input} bind:value={name} data-testid="name-input" aria-label="Name" />
        <div class="dialog-actions">
          <button type="button" onclick={oncancel}>Cancel</button>
          <button type="submit" class="primary" data-testid="dialog-ok" disabled={!valid}>OK</button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
