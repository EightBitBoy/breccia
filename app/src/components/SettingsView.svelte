<script lang="ts">
  import { tick } from 'svelte'
  import type { SettingsSection } from '../lib/settings.svelte'
  import type { ThemeChoice } from '../lib/theme'
  import type { BoardSummary, GitSettings, RecentFolder, StateRename, StateUsage, StateView } from '../lib/types'
  import appIcon from '../../src-tauri/icons/icon.svg'
  import RecentFolders from './RecentFolders.svelte'
  import StatesSection from './settings/StatesSection.svelte'
  import BoardsSection from './settings/BoardsSection.svelte'
  import GitSection from './settings/GitSection.svelte'
  import AppearanceSection from './settings/AppearanceSection.svelte'
  import KeyboardSection from './settings/KeyboardSection.svelte'

  let {
    folder,
    recent,
    section,
    states,
    version,
    usage,
    skipped,
    boards,
    archiveDays,
    autoArchive,
    git,
    gitText,
    theme,
    mac,
    appVersion,
    hasGit,
    onstates,
    onconfirm,
    onready,
    onusage,
    onboard,
    onmoveboard,
    onnewboard,
    onarchivedays,
    onautoarchive,
    ongit,
    onhelp,
    ontheme,
    onpickfolder,
    onopenfolder,
    onforgetfolder,
    onmissingfolder,
  }: {
    folder: string
    /** The recent folders other than the open one. */
    recent: RecentFolder[]
    /** The section asked for when Settings opened; scrolled into view once. */
    section: SettingsSection | null
    states: StateView[]
    /** `ConfigView.version` of the settings shown. */
    version: number
    usage: StateUsage[]
    skipped: number
    boards: BoardSummary[]
    archiveDays: number
    autoArchive: boolean
    /** The `[git]` settings; null until the config is loaded. */
    git: GitSettings | null
    gitText: string | null
    theme: ThemeChoice
    mac: boolean
    /** The running program's version (not the config's `version`); null until known or if it is not. */
    appVersion: string | null
    /** Whether the git command exists on this computer; null while not yet known. */
    hasGit: boolean | null
    onstates: (states: StateView[], renames: StateRename[], version: number) => Promise<void>
    onconfirm: (message: string, ok: string) => Promise<boolean>
    /** Settles once every config write sent before is answered and applied. */
    onready: () => Promise<void>
    /** As `onready`, then the states' blocks are counted again. */
    onusage: () => Promise<void>
    onboard: (i: number) => void
    onmoveboard: (i: number, dir: -1 | 1) => void
    onnewboard: () => void
    onarchivedays: (n: number) => Promise<void>
    onautoarchive: (on: boolean) => Promise<void>
    /** The Keyboard section's link to the F1 list. */
    onhelp: () => void
    ongit: (patch: Partial<GitSettings>) => Promise<void>
    ontheme: (c: ThemeChoice) => void
    /** "Open folder…" or "New folder…": the parent asks for the folder and switches. */
    onpickfolder: (type: 'folder.open' | 'folder.create') => void
    onopenfolder: (path: string) => void
    onforgetfolder: (path: string) => void
    onmissingfolder: (path: string) => void
  } = $props()

  let root = $state<HTMLElement | undefined>()

  $effect(() => {
    const s = section
    const el = root
    if (!s || !el) return
    void tick().then(() => el.querySelector(`section[data-section="${s}"]`)?.scrollIntoView({ block: 'start' }))
  })
</script>

<div class="settings" data-testid="settings" bind:this={root}>
  <h1>Settings</h1>
  <section data-section="folder">
    <h2>Notes folder</h2>
    <p class="settings-path" title={folder}>{folder}</p>
    <div class="settings-folder-actions">
      <button onclick={() => onpickfolder('folder.open')}>Open folder…</button>
      <button onclick={() => onpickfolder('folder.create')}>New folder…</button>
    </div>
    {#if recent.length}
      <h3 class="settings-sub">Recent folders</h3>
      <p class="settings-hint">Kept on this computer. Click one to switch to it.</p>
      <RecentFolders list={recent} onopen={onopenfolder} onforget={onforgetfolder} onmissing={onmissingfolder} />
    {/if}
  </section>
  <section data-section="states">
    <h2>States</h2>
    <StatesSection {states} {version} {usage} {skipped} {onstates} {onconfirm} {onready} {onusage} />
  </section>
  <section data-section="boards">
    <h2>Boards</h2>
    <BoardsSection {boards} {archiveDays} {onboard} {onmoveboard} {onnewboard} {onarchivedays} {autoArchive} {onautoarchive} />
  </section>
  <section data-section="git">
    <h2>Git</h2>
    {#if hasGit === false}
      <p class="settings-hint" data-testid="git-missing">
        💡 Git was not found on this computer. Breccia uses the installed Git for versioning and sync of your notes
        folder. Install Git and restart Breccia for full Git support.
      </p>
    {:else if git}<GitSection {git} {gitText} {ongit} />{/if}
  </section>
  <section data-section="journal">
    <h2>Journal</h2>
    <p class="settings-hint">
      Journal pages are kept in journals/, one file per day (YYYY-MM-DD.md). There are no journal settings yet.
    </p>
  </section>
  <section data-section="appearance">
    <h2>Appearance</h2>
    <AppearanceSection {theme} {ontheme} />
  </section>
  <section data-section="keyboard">
    <h2>Keyboard</h2>
    <KeyboardSection {mac} {onhelp} />
  </section>
  <section data-section="about">
    <h2>About</h2>
    <img class="settings-about-icon" src={appIcon} alt="" width="96" height="96" data-testid="app-icon" />
    <dl class="settings-about">
      <dt>Application</dt>
      <dd data-testid="app-name">Breccia</dd>
      <dt>Version</dt>
      <dd data-testid="app-version">{appVersion ?? 'unknown'}</dd>
      <dt>Developer</dt>
      <dd data-testid="app-developer">Stefan Härtel</dd>
      <dt>License</dt>
      <dd data-testid="app-license">MIT License</dd>
      <dt>Source code</dt>
      <!-- Class ext: the app's link handler opens it in the system browser, never in the webview. -->
      <dd data-testid="app-source"><a class="ext" href="https://github.com/EightBitBoy/breccia">github.com/EightBitBoy/breccia</a></dd>
    </dl>
  </section>
</div>
