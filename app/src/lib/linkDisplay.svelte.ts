// The two link-display choices, kept on this computer, shared by every rendered block.
import { shortenLinks, type LinkDisplay } from './linkDisplay'

class LinkDisplayChoice implements LinkDisplay {
  hideScheme = $state(false)
  shorten = $state(false)

  restore(ui: { hideLinkScheme?: boolean | null; shortenLinks?: boolean | null }): void {
    this.hideScheme = ui.hideLinkScheme === true
    this.shorten = ui.shortenLinks === true
  }

  /** `html` as the choices ask; reading it in a template makes the template follow the choices. */
  apply(html: string): string {
    return shortenLinks(html, this)
  }
}

export const linkDisplay = new LinkDisplayChoice()
