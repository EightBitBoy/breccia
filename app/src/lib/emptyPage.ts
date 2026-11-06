// The text of the button on a page with no blocks.

/** What the button on a page with no blocks says: a page with a file (a moved page's empty file) is empty;
 * a page without one gets its file once text is typed. */
export function emptyPageText(hasFile: boolean): string {
  return hasFile ? '💡 Empty page. Start writing…' : '💡 No file exists yet. Start writing to create it…'
}
