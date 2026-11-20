// The link-display choices, kept on this computer, shared by every rendered block.
import { shortenLinks, titleLinks, type LinkDisplay } from './linkDisplay'

class LinkDisplayChoice implements LinkDisplay {
  hideScheme = $state(false)
  shorten = $state(false)
  trimSlash = $state(false)

  restore(ui: { hideLinkScheme?: boolean | null; shortenLinks?: boolean | null; trimLinkSlash?: boolean | null }): void {
    this.hideScheme = ui.hideLinkScheme === true
    this.shorten = ui.shortenLinks === true
    this.trimSlash = ui.trimLinkSlash === true
  }

  /**
   * `html` as the choices ask, each web link with its full address as its tooltip; reading it in a template makes the
   * template follow the choices.
   */
  apply(html: string): string {
    return titleLinks(shortenLinks(html, this))
  }
}

export const linkDisplay = new LinkDisplayChoice()
