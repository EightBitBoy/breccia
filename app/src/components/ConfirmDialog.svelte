<script lang="ts">
  import { AlertDialog } from 'bits-ui'

  let {
    message,
    ok = 'OK',
    top = false,
    onok,
    oncancel,
  }: {
    message: string
    /** The label of the button that goes ahead. */
    ok?: string
    /** Above everything, the reload layer included (the close question). */
    top?: boolean
    onok: () => void
    oncancel: () => void
  } = $props()
</script>

<AlertDialog.Root open onOpenChange={(o) => !o && oncancel()}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class={top ? 'overlay top' : 'overlay'} />
    <AlertDialog.Content class={top ? 'dialog top' : 'dialog'} aria-describedby={undefined} data-testid="confirm-dialog">
      <AlertDialog.Title class="dialog-title">{message}</AlertDialog.Title>
      <div class="dialog-actions">
        <AlertDialog.Cancel type="button">Cancel</AlertDialog.Cancel>
        <button type="button" class="primary" data-testid="dialog-ok" onclick={onok}>{ok}</button>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
