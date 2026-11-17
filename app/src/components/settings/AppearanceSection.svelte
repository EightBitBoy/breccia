<script lang="ts">
  import { linkDisplay } from '../../lib/linkDisplay.svelte'
  import { SHORT_LENGTH } from '../../lib/linkDisplay'

  let { onchange }: { onchange: (hideScheme: boolean, shorten: boolean) => void } = $props()
</script>

<label class="settings-field">
  <input
    type="checkbox"
    data-testid="hide-link-scheme"
    checked={linkDisplay.hideScheme}
    onchange={(e) => onchange(e.currentTarget.checked, linkDisplay.shorten)}
  />
  Hide https:// in web addresses
</label>
<label class="settings-field">
  <input
    type="checkbox"
    data-testid="shorten-links"
    checked={linkDisplay.shorten}
    onchange={(e) => onchange(linkDisplay.hideScheme, e.currentTarget.checked)}
  />
  Shorten long web addresses to {SHORT_LENGTH} characters after the domain
</label>
