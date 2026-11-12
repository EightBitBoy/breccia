// The built-in themes: ids, names, and applying one to the document.
export const THEMES = ['light', 'taupe', 'parchment', 'dark', 'graphite', 'violet', 'teal', 'vampire', 'fjord', 'ember', 'oxblood'] as const
export type ThemeId = (typeof THEMES)[number]
export type ThemeChoice = 'system' | ThemeId

/** The menu's and Settings' choices, in order: System first, then every theme. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', ...THEMES]

/** The next (1, down the menu) or previous (-1) choice, wrapping at both ends. */
export function stepTheme(c: ThemeChoice, by: 1 | -1): ThemeChoice {
  const n = THEME_CHOICES.length
  const i = THEME_CHOICES.indexOf(c)
  return THEME_CHOICES[(((i < 0 ? 0 : i) + by) % n + n) % n]
}

export const THEME_NAMES: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  violet: 'Violet',
  graphite: 'Graphite',
  taupe: 'Taupe',
  parchment: 'Parchment',
  teal: 'Teal',
  ember: 'Ember',
  fjord: 'Fjord',
  vampire: 'Vampire',
  oxblood: 'Oxblood',
}

/** A known theme id, else `system`. */
export function parseTheme(v: unknown): ThemeChoice {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v) ? (v as ThemeId) : 'system'
}

/** The window chrome's scheme for a choice; null follows the operating system. */
export function windowTheme(c: ThemeChoice): 'light' | 'dark' | null {
  if (c === 'system') return null
  return c === 'light' || c === 'taupe' || c === 'parchment' ? 'light' : 'dark'
}

/** What `settings.json` stores for a choice; null for `system`. */
export function storedTheme(c: ThemeChoice): string | null {
  return c === 'system' ? null : c
}

/** Sets or clears `data-theme` and tells the window; a failure is logged, never thrown. */
export function applyTheme(
  c: ThemeChoice,
  root: { dataset: DOMStringMap },
  setWindowTheme: (t: 'light' | 'dark' | null) => Promise<void>,
): void {
  if (c === 'system') delete root.dataset.theme
  else root.dataset.theme = c
  try {
    setWindowTheme(windowTheme(c)).catch((e) => console.error('could not set the window theme', e))
  } catch (e) {
    console.error('could not set the window theme', e)
  }
}
