<script lang="ts">
  import { tick } from 'svelte'
  import type { AppController } from '../lib/app.svelte'
  import type { ConfigStore } from '../lib/config.svelte'
  import type { SettingsScreen } from '../lib/settings.svelte'
  import type { ThemeChoice } from '../lib/theme'
  import type { JournalsAt } from '../lib/treeRows'
  import type { LinkDisplay } from '../lib/linkDisplay'
  import type { GitSettings, RecentFolder, StateRename, StateView } from '../lib/types'
  import appIcon from '../../src-tauri/icons/icon.svg'
  import RecentFolders from './RecentFolders.svelte'
  import StatesSection from './settings/StatesSection.svelte'
  import BoardsSection from './settings/BoardsSection.svelte'
  import GitSection from './settings/GitSection.svelte'
  import AppearanceSection from './settings/AppearanceSection.svelte'
  import ThemesSection from './settings/ThemesSection.svelte'
  import KeyboardSection from './settings/KeyboardSection.svelte'
  import DailiesSection from './settings/DailiesSection.svelte'

  let {
    app,
    config,
    settings,
    recent,
    theme,
    journalsAt,
    mac,
  }: {
    /** The window: the screen's buttons call it. */
    app: AppController
    /** The settings in `breccia/config.toml`, and their writes. */
    config: ConfigStore
    /** The asked-for section, and the states' usage counts. */
    settings: SettingsScreen
    /** The recent folders other than the open one. */
    recent: RecentFolder[]
    theme: ThemeChoice
    journalsAt: JournalsAt
    mac: boolean
  } = $props()

  const folder = $derived(app.folder ?? '')
  /** The section asked for when Settings opened; scrolled into view once. */
  const section = $derived(settings.section)
  const states = $derived(config.states)
  /** `ConfigView.version` of the settings shown. */
  const version = $derived(config.version)
  const usage = $derived(settings.usage)
  const skipped = $derived(settings.skipped)
  const boards = $derived(config.boards)
  const archiveDays = $derived(config.archiveDays)
  const autoArchive = $derived(config.autoArchive)
  /** The `[git]` settings; null until the config is loaded. */
  const git = $derived(config.git)
  /** The file's value of that number is refused and read as the default: saving any valid number writes it. */
  const archiveInvalid = $derived(config.numbersInvalid.archive)
  const delayInvalid = $derived(config.numbersInvalid.delay)
  const intervalInvalid = $derived(config.numbersInvalid.interval)
  /** `[dailies] reset` as `HH:MM`. */
  const dailiesReset = $derived(app.dailies.reset)
  /** The file's `[dailies] reset` is no time (read as 00:00): saving any time writes it. */
  const dailiesResetInvalid = $derived(config.dailiesResetInvalid)
  /** The running program's version (not the config's `version`); null until known or if it is not. */
  const appVersion = $derived(app.appVersion)
  /** Whether the git command exists on this computer; null while not yet known. */
  const hasGit = $derived(app.hasGit)
  /** The log file's folder, shown as the button's tooltip; null until known or if there is none. */
  const logFolder = $derived(app.logDir)

  const onstates = (list: StateView[], renames: StateRename[], v: number) => config.setStates(list, renames, v)
  const onconfirm = (message: string, ok: string) => app.confirmAsk(message, ok)
  /** Settles once every config write sent before is answered and applied. */
  const onready = () => config.ready()
  /** As `onready`, then the states' blocks are counted again. */
  const onusage = () => config.countUsage()
  const onboard = (i: number) => config.editBoard(i)
  const onmoveboard = (i: number, dir: -1 | 1) => void config.moveBoard(i, dir)
  const onnewboard = () => app.overlays.open({ kind: 'newBoard', from: 'settings' })
  const onarchivedays = (archiveAfterDays: number) => config.setBoardSettings({ archiveAfterDays })
  const onautoarchive = (on: boolean) => config.setBoardSettings({ autoArchive: on })
  const ongit = (patch: Partial<GitSettings>) => config.setGit(patch)
  /** Settles once answered. */
  const ondailiesreset = (reset: string) => config.setDailiesReset(reset)
  /** The Keyboard section's link to the F1 list. */
  const onhelp = () => app.toggleHelp()
  const ontheme = (c: ThemeChoice) => app.chooseTheme(c)
  const onlinkdisplay = (d: LinkDisplay) => app.chooseLinkDisplay(d)
  const onopenfolder = (path: string) => void app.switchFolder('folder.open', path)
  const onforgetfolder = (path: string) => void app.forgetRecent(path)
  const onmissingfolder = (path: string) => app.recentMissing(path)

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
      <button onclick={() => void app.pickAndSwitch('folder.open')}>Open folder…</button>
      <button onclick={() => void app.pickAndSwitch('folder.create')}>New folder…</button>
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
    <BoardsSection {boards} {archiveDays} {archiveInvalid} {onboard} {onmoveboard} {onnewboard} {onarchivedays} {autoArchive} {onautoarchive} />
  </section>
  <section data-section="git">
    <h2>Git</h2>
    {#if hasGit === false}
      <p class="settings-hint" data-testid="git-missing">
        💡 Git was not found on this computer. Breccia uses the installed Git for versioning and sync of your notes
        folder. Install Git and restart Breccia for full Git support.
      </p>
    {:else if git}<GitSection {git} {delayInvalid} {intervalInvalid} {ongit} />{/if}
  </section>
  <section data-section="journal">
    <h2>Journal</h2>
    <p class="settings-hint">
      Journal pages are kept in journals/, one file per day (YYYY-MM-DD.md).
    </p>
    <p class="settings-hint">This computer only: not stored in the notes folder.</p>
    <div class="theme-options" role="radiogroup" aria-label="Journals in the sidebar's Pages list">
      {#each [['top', 'At the top'], ['bottom', 'At the bottom'], ['inline', 'Among the folders, by name']] as [v, name] (v)}
        <button
          type="button"
          class="theme-option"
          role="radio"
          aria-checked={journalsAt === v}
          data-testid="journals-at-option"
          data-journals-at={v}
          onclick={() => app.chooseJournalsAt(v as JournalsAt)}
        >
          <span class="theme-name">{name}</span>
        </button>
      {/each}
    </div>
  </section>
  <section data-section="dailies">
    <h2>Dailies</h2>
    <DailiesSection reset={dailiesReset} invalid={dailiesResetInvalid} onreset={ondailiesreset} />
  </section>
  <section data-section="themes">
    <h2>Themes</h2>
    <ThemesSection {theme} {ontheme} />
  </section>
  <section data-section="appearance">
    <h2>Appearance</h2>
    <AppearanceSection onchange={onlinkdisplay} />
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
    <div class="settings-folder-actions">
      <button data-testid="show-changelog" onclick={() => settings.showChangelog()}>Show changelog</button>
    </div>
  </section>
  <section data-section="troubleshooting">
    <h2>Troubleshooting</h2>
    <p class="settings-hint">Breccia writes warnings and errors to a log file. It holds no note text.</p>
    <div class="settings-folder-actions">
      <button data-testid="open-log-folder" title={logFolder ?? undefined} onclick={() => app.openLogs()}>Open log folder</button>
    </div>
  </section>
</div>
