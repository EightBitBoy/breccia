<script lang="ts">
  // The line-drawn calendar: the date picker's button and the slash menu's date entries. It takes the text colour.
  let { size = 14, class: cls = '' }: { size?: number; class?: string } = $props()
</script>

<svg class={cls} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
  <rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3" />
  <path d="M1.5 6h13M5 1v3M11 1v3" stroke="currentColor" stroke-width="1.3" fill="none" />
  <rect x="9" y="9" width="3" height="3" rx=".5" fill="currentColor" />
</svg>
