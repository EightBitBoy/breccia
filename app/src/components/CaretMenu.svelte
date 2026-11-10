<script lang="ts">
  import type { MenuView } from '../editor/menu'
  import CalendarIcon from './CalendarIcon.svelte'

  let {
    menu,
    testid,
    onchoose,
  }: { menu: MenuView; testid: string; onchoose: (index: number) => void } = $props()
</script>

<!-- Pressing an item must not take the focus from the editor. -->
<div class="slash-menu" data-testid={testid} role="listbox" style:left="{menu.left}px" style:top="{menu.top}px">
  {#each menu.items as item, i}
    <div
      class="slash-item"
      class:selected={i === menu.index}
      role="option"
      tabindex="-1"
      aria-selected={i === menu.index}
      onmousedown={(e) => {
        e.preventDefault()
        onchoose(i)
      }}
    >
      {#if item.icon === 'calendar'}<CalendarIcon class="icon" />{/if}{#if item.color}<span class="st" data-color={item.color}>{item.label}</span>{:else}{item.label}{/if}{#if item.note}<span class="kind">{item.note}</span>{/if}
    </div>
  {/each}
</div>
