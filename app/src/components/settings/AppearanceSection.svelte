<script lang="ts">
  import { linkDisplay } from '../../lib/linkDisplay.svelte'
  import { SHORT_LENGTH, type LinkDisplay } from '../../lib/linkDisplay'

  let { onchange }: { onchange: (d: LinkDisplay) => void } = $props()

  /** The current choices with one of them changed. */
  const change = (patch: Partial<LinkDisplay>) =>
    onchange({ hideScheme: linkDisplay.hideScheme, shorten: linkDisplay.shorten, trimSlash: linkDisplay.trimSlash, ...patch })
</script>

<label class="settings-field">
  <input
    type="checkbox"
    data-testid="hide-link-scheme"
    checked={linkDisplay.hideScheme}
    onchange={(e) => change({ hideScheme: e.currentTarget.checked })}
  />
  Hide https:// in web addresses
</label>
<label class="settings-field">
  <input
    type="checkbox"
    data-testid="shorten-links"
    checked={linkDisplay.shorten}
    onchange={(e) => change({ shorten: e.currentTarget.checked })}
  />
  Shorten long web addresses to {SHORT_LENGTH} characters after the domain
</label>
<label class="settings-field">
  <input
    type="checkbox"
    data-testid="trim-link-slash"
    checked={linkDisplay.trimSlash}
    onchange={(e) => change({ trimSlash: e.currentTarget.checked })}
  />
  Trim the trailing slash from web addresses
</label>
