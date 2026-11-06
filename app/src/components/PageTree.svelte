<script lang="ts">
  import { folds, type Row } from '../lib/treeRows'
  import { treeDrag, treeDrop, type TreeDropEnv } from '../lib/dnd'
  import { autoHideScrollbar } from '../lib/scrollFade'

  let {
    rows,
    tags,
    shown,
    ontoggle,
    onopen,
    dropEnv,
  }: {
    rows: Row[]
    /** The Tags section's rows; the section is left out when there are none. */
    tags: Row[]
    /** The key of the page shown, whose row is marked. */
    shown: string | null
    ontoggle: (id: string) => void
    /** Open the page with this name or day key. */
    onopen: (name: string) => void
    /** What the rows' drop targets ask about a drag (pages and folders can be dragged onto folders). */
    dropEnv: TreeDropEnv
  } = $props()

  function activate(r: Row) {
    if (folds(r)) ontoggle(r.id)
    else if (r.kind === 'page' || r.kind === 'tag') onopen(r.label)
    else if (r.kind === 'day' && r.key) onopen(r.key)
  }

  function onkey(e: KeyboardEvent, r: Row) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    activate(r)
  }
</script>

<div class="tree" role="tree" use:autoHideScrollbar>
  {#each rows as r (r.id)}
    <div
      class="nav"
      class:on={r.key !== undefined && r.key === shown}
      class:linked-only={r.linkedOnly}
      title={r.linkedOnly ? 'Only linked to: no text of its own yet' : undefined}
      style:padding-left="calc(10px + {r.depth} * 18px)"
      role="treeitem"
      aria-selected={r.key !== undefined && r.key === shown}
      aria-expanded={folds(r) ? r.open : undefined}
      tabindex="0"
      data-row={r.id}
      data-drop={r.kind === 'folder' ? r.id : undefined}
      use:treeDrag={r}
      use:treeDrop={{ over: r, env: dropEnv }}
      onclick={() => activate(r)}
      onkeydown={(e) => onkey(e, r)}
    >
      <span class="caret">{folds(r) ? (r.open ? '▾' : '▸') : ''}</span>{r.label}
    </div>
  {/each}
  {#if tags.length}
    <div class="group group-tags" data-no-menu data-testid="tags-group">Tags</div>
    {#each tags as r (r.id)}
      <div
        class="nav tag-row"
        class:on={r.key === shown}
        class:linked-only={r.linkedOnly}
        title={r.linkedOnly ? 'No text of its own yet' : undefined}
        role="treeitem"
        aria-selected={r.key === shown}
        tabindex="0"
        data-row={r.id}
        data-testid="tag-row"
        onclick={() => activate(r)}
        onkeydown={(e) => onkey(e, r)}
      >
        <span class="tag-hash">#</span><span class="tag-name">{r.label}</span><span class="tag-count">{r.count}</span>
      </div>
    {/each}
  {/if}
</div>
