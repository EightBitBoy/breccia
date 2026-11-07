// The current theme's tokens, read from the computed style, for the colours computed at runtime (custom page colors).
// They are read again when the chosen theme changes (`data-theme` on the root) and when the system's colour scheme
// changes (the System theme follows it). Every read gives a new object, which is what the shade cache is keyed on.
import { readThemeTokens, type ThemeTokens } from './customColor'

class CurrentTokens {
  /** Null only before `watchThemeTokens` first reads them. */
  current = $state.raw<ThemeTokens | null>(null)
}

export const themeTokens: { current: ThemeTokens | null } = new CurrentTokens()

/** Reads the tokens of `root` now and on every theme change; returns the function that stops watching. */
export function watchThemeTokens(root: HTMLElement): () => void {
  const read = () => {
    try {
      const style = getComputedStyle(root)
      themeTokens.current = readThemeTokens((n) => style.getPropertyValue(n))
    } catch (e) {
      // A theme without the tokens keeps the last ones: custom colors stay as they were, nothing else breaks.
      console.error('could not read the theme tokens', e)
    }
  }
  read()
  const observer = new MutationObserver(read)
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  scheme.addEventListener('change', read)
  return () => {
    observer.disconnect()
    scheme.removeEventListener('change', read)
  }
}
