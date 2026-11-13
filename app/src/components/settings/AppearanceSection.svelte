<script lang="ts">
  import { linkDisplay } from '../../lib/linkDisplay.svelte'
  import { SHORT_LENGTH } from '../../lib/linkDisplay'

  let { onchange }: { onchange: (hideScheme: boolean, shorten: boolean) => void } = $props()
</script>

<p class="settings-hint">
  This computer only: how a web address in the text is shown. The text in the file and the link's target do not
  change, and the block you are editing shows the whole address.
</p>
<label class="tog">
  <input
    type="checkbox"
    data-testid="hide-link-scheme"
    checked={linkDisplay.hideScheme}
    onchange={(e) => onchange(e.currentTarget.checked, linkDisplay.shorten)}
  />
  Hide https:// in web addresses
</label>
<label class="tog">
  <input
    type="checkbox"
    data-testid="shorten-links"
    checked={linkDisplay.shorten}
    onchange={(e) => onchange(linkDisplay.hideScheme, e.currentTarget.checked)}
  />
  Shorten long web addresses to {SHORT_LENGTH} characters after the domain
</label>
