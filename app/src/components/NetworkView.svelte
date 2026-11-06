<script lang="ts">
  // The Graph screen (spec §7.11): a toolbar of filters over the sigma picture. The picture's code (sigma, graphology,
  // ForceAtlas2) comes from one dynamic import of `sigmaView`, the first time the graph opens.
  import { onMount, untrack } from 'svelte'
  import type Graph from 'graphology'
  import {
    canRearrange,
    countText,
    findMatches,
    findStep,
    graphKey,
    limitOptions,
    limitValue,
    lines,
    moveChoice,
    parseLimit,
    shownLines,
    shownNodes,
  } from '../lib/graph'
  import { readColours } from '../lib/graphColours'
  import type { Network } from '../lib/network.svelte'
  import type { LayoutRunner, LayoutState } from '../lib/layoutRunner'
  import type { NetworkRenderer } from '../lib/sigmaView'
  import type { GraphView } from '../lib/types'

  type SigmaView = typeof import('../lib/sigmaView')

  let { network, onopen }: { network: Network; onopen: (name: string) => void } = $props()

  let canvas = $state<HTMLDivElement | undefined>()
  /** The loaded `sigmaView` module; null until the import resolves. */
  let mod = $state.raw<SigmaView | null>(null)
  let renderer = $state.raw<NetworkRenderer | null>(null)
  let graph: Graph | null = null
  let runner: LayoutRunner | null = null
  let layout = $state<'none' | LayoutState | 'saved'>('none')
  let drawn = $state(false)
  let hovered = $state<string | null>(null)
  let highlight = $state<string | null>(null)
  /** Dots were added by a live update since the layout was last saved. */
  let unsaved = false

  // The Find box.
  let findText = $state('')
  let choice = $state(0)
  let findOpen = $state(false)
  /** The last Enter that focused a dot: Enter again on the same text and choice opens it. */
  let lastFind: { text: string; chosen: string | null } | null = null

  const view = $derived(network.view)
  const allLines = $derived(view ? lines(view) : [])
  const shown = $derived(view ? shownNodes(view, network.filters) : [])
  const shownKeys = $derived(new Set(view ? view.nodes.filter((_, i) => shown[i]).map((n) => n.key) : []))
  const lineCount = $derived(shownLines(allLines, shown).length)
  const options = $derived(view ? limitOptions(view) : { folders: [], tags: [] })
  const label = $derived(`Network of ${shownKeys.size} pages and ${lineCount} links`)
  const matches = $derived(view ? findMatches(view, shown, findText).map((i) => view.nodes[i]) : [])
  const chosen = $derived(matches.length ? Math.min(choice, matches.length - 1) : -1)

  const colours = () => readColours((n) => getComputedStyle(document.documentElement).getPropertyValue(n))

  onMount(() => {
    let gone = false
    void import('../lib/sigmaView').then((m) => {
      if (!gone) mod = m
    })
    // The theme: `data-theme` on <html> (a chosen theme) or the system's colour scheme (System).
    const recolour = () => renderer?.setColours(colours())
    const themeObserver = new MutationObserver(recolour)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', recolour)
    const sizeObserver = new ResizeObserver(() => renderer?.resize())
    if (canvas) sizeObserver.observe(canvas)
    return () => {
      gone = true
      themeObserver.disconnect()
      scheme.removeEventListener('change', recolour)
      sizeObserver.disconnect()
      // Leaving after dots were added: keep where they are, unless the layout is still moving them.
      if (graph && mod && unsaved && !runner?.running) network.saveLayout(mod.readPositions(graph))
      runner?.dispose()
      renderer?.kill()
    }
  })

  // Every `graph.get` answer: the first builds the picture, later ones update it.
  $effect(() => {
    const v = view
    const m = mod
    const el = canvas
    if (!m || !v || !el) return
    untrack(() => (graph ? update(m, v) : build(m, v, el)))
  })

  /** The first view: show it from the saved positions. Only a view mostly without saved positions is arranged;
   *  otherwise the few new dots stay where they were placed, as live updates do, and leaving saves them. */
  function build(m: SigmaView, v: GraphView, el: HTMLElement): void {
    const built = m.buildGraph(v, new Map())
    graph = built.graph
    const r = m.createRenderer(el, colours(), {
      onClick: (key) => {
        const name = graph?.getNodeAttribute(key, 'name')
        if (typeof name === 'string') onopen(name)
      },
      onHover: (key) => (hovered = key),
      onDrawn: () => (drawn = true),
    })
    r.load(built.graph)
    renderer = r
    if (built.graph.order === 0) return
    if (!m.needsLayout(built.placed, built.graph.order)) {
      layout = 'saved'
      unsaved = built.placed > 0
      r.holdFrame(true)
      return
    }
    arrange(m)
  }

  /** A later view: dots already there stay put; the layout only restarts if it was running. */
  function update(m: SigmaView, v: GraphView): void {
    const g = graph
    if (!g) return
    const wasEmpty = g.order === 0
    const added = m.updateGraph(g, v)
    renderer?.update()
    if (g.order === 0) {
      runner?.stop()
      layout = 'none'
      return
    }
    // A graph that had no dots has no arrangement to keep: its first dots are arranged as on a first view.
    if (runner?.running || wasEmpty) arrange(m)
    else if (added > 0) unsaved = true
  }

  /** Runs the layout from the current positions; when it stops, the positions are saved. */
  function arrange(m: SigmaView): void {
    const g = graph
    if (!g || g.order === 0) return
    runner ??= new m.LayoutRunner(m.layoutWorker, () => performance.now())
    renderer?.holdFrame(false)
    layout = 'running'
    runner.start(g, (s) => {
      layout = s
      renderer?.redraw()
      if (s === 'running') return
      renderer?.holdFrame(true)
      unsaved = false
      network.saveLayout(m.readPositions(g))
    })
  }

  // Filters only hide dots; every dot keeps its place.
  $effect(() => {
    const keys = shownKeys
    renderer?.setHidden((k) => keys.has(k))
  })

  // A highlighted dot that is gone or hidden is no longer highlighted.
  $effect(() => {
    const keys = shownKeys
    untrack(() => {
      if (highlight !== null && !keys.has(highlight)) setHighlight(null)
    })
  })

  function setHighlight(key: string | null): void {
    highlight = key
    renderer?.highlight(key)
  }

  function findInput(text: string): void {
    findText = text
    choice = 0
    findOpen = true
    // Typing starts over: the next Enter centres again rather than opening, and the old highlight goes.
    lastFind = null
    setHighlight(null)
  }

  /** Enter on a choice: centre and highlight it; Enter again opens it. */
  function findEnter(): void {
    const node = matches[chosen]
    if (!node) return
    if (findStep(lastFind, findText, node.key) === 'open') {
      onopen(node.name)
      return
    }
    lastFind = { text: findText, chosen: node.key }
    setHighlight(node.key)
    renderer?.focus(node.key)
    // The list closes so it never covers the picture's centre, where the dot now is.
    findOpen = false
  }

  function findKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      choice = moveChoice(chosen, matches.length, e.key === 'ArrowDown' ? 1 : -1)
      findOpen = true
    } else if (e.key === 'Enter') {
      e.preventDefault()
      findEnter()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      findText = ''
      findOpen = false
      lastFind = null
      setHighlight(null)
    }
  }

  /** Keys on the focused picture only: arrows pan, `+` / `-` zoom, `0` fits. */
  function canvasKey(e: KeyboardEvent): void {
    const a = graphKey(e)
    if (!a || !renderer) return
    e.preventDefault()
    if (a.kind === 'pan') renderer.pan(a.dx, a.dy)
    else if (a.kind === 'zoom') renderer.zoom(a.factor)
    else renderer.fit()
  }
</script>

<section
  class="network"
  data-testid="network"
  data-layout={layout}
  data-drawn={drawn ? '1' : undefined}
  data-hovered={hovered}
  data-highlight={highlight}
>
  <div class="graph-bar">
    <div class="graph-find">
      <input
        type="search"
        data-testid="graph-find"
        placeholder="Find page"
        aria-label="Find page"
        autocomplete="off"
        spellcheck="false"
        value={findText}
        oninput={(e) => findInput(e.currentTarget.value)}
        onkeydown={findKey}
        onblur={() => (findOpen = false)}
        role="combobox"
        aria-controls="graph-find-list"
        aria-expanded={findOpen && matches.length > 0}
        aria-autocomplete="list"
        aria-activedescendant={findOpen && matches.length ? `graph-find-${chosen}` : undefined}
      />
      {#if findOpen && matches.length}
        <div class="graph-find-list" id="graph-find-list" role="listbox" aria-label="Pages found">
          {#each matches as n, i (n.key)}
            <button
              type="button"
              class="graph-find-row"
              id={`graph-find-${i}`}
              class:on={i === chosen}
              role="option"
              aria-selected={i === chosen}
              tabindex="-1"
              data-testid="graph-find-row"
              onmousedown={(e) => {
                // Keeps the focus in the box, so Enter again opens the page.
                e.preventDefault()
                choice = i
                findEnter()
              }}
            >
              {n.title}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <label class="tog">
      <input
        type="checkbox"
        data-testid="graph-hide-journals"
        checked={network.filters.hideJournals}
        onchange={(e) => network.setFilters({ hideJournals: e.currentTarget.checked })}
      />
      Hide journal pages
    </label>
    <label class="tog">
      <input
        type="checkbox"
        data-testid="graph-hide-tags"
        checked={network.filters.hideTagOnly}
        onchange={(e) => network.setFilters({ hideTagOnly: e.currentTarget.checked })}
      />
      Hide tag-only pages
    </label>
    <label class="tog">
      Limit to
      <select
        data-testid="graph-limit"
        value={limitValue(network.filters.limit)}
        onchange={(e) => network.setFilters({ limit: parseLimit(e.currentTarget.value) })}
      >
        <option value="all">Everything</option>
        {#if options.folders.length}
          <optgroup label="Folders">
            {#each options.folders as f (f)}
              <option value={limitValue({ kind: 'folder', folder: f })}>{f}</option>
            {/each}
          </optgroup>
        {/if}
        {#if options.tags.length}
          <optgroup label="Tags">
            {#each options.tags as t (t.key)}
              <option value={limitValue({ kind: 'tag', key: t.key })}>#{t.title}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
    </label>
    <button
      type="button"
      data-testid="graph-rearrange"
      disabled={!canRearrange(mod !== null, layout, shownKeys.size)}
      onclick={() => mod && arrange(mod)}
    >
      Re-arrange
    </button>
    <span class="graph-count" data-testid="graph-count">{countText(shownKeys.size, lineCount)}</span>
  </div>
  <div class="graph-area">
    <!-- Focusable so the keyboard can pan and zoom the picture: an `application` takes its own keys, which
         Svelte's a11y lint counts as non-interactive. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="graph-canvas"
      data-testid="graph-canvas"
      tabindex="0"
      role="application"
      aria-label={label}
      aria-roledescription="network picture"
      onkeydown={canvasKey}
      bind:this={canvas}
    ></div>
    {#if view && shownKeys.size === 0}
      <p class="graph-empty" data-testid="graph-empty">
        {view.nodes.length === 0 ? 'No pages yet.' : 'No pages to show with these filters.'}
      </p>
    {/if}
  </div>
</section>
