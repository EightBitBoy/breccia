// The Writing tab of the F1 overlay: one small example per syntax a user writes, Breccia's own first, then the
// Markdown basics. `doc` quotes the words of `docs/format.md` that describe the syntax; `writing.test.ts` checks that
// the doc still holds them, so a row cannot name a syntax the format reference does not.

export type WritingRow = {
  group: string
  /** The syntax as typed; may hold line breaks. */
  example: string
  what: string
  /** Text that `docs/format.md` holds where it describes this syntax. */
  doc: string
}

export type WritingGroup = { name: string; rows: WritingRow[] }

/** The states of a new notes folder (`docs/format.md` §11), shown until the configured ones are known. */
export const DEFAULT_STATES: readonly string[] = ['TODO', 'DOING', 'WAITING', 'DONE']

const LINKS = 'Links and tags'
const TASKS = 'Tasks and properties'
const MARKDOWN = 'Markdown'

/** The rows, with the task row showing `states` (the configured keywords; the defaults when there are none). */
export function writingRows(states: readonly string[]): WritingRow[] {
  const list = states.length ? states : DEFAULT_STATES
  return [
    { group: LINKS, example: '[[Project X]]', what: 'A link to a page; the page is made when it gets text', doc: '`[[name]]`' },
    { group: LINKS, example: '[[Project X|the project]]', what: 'A link that shows other text', doc: '`[[name|shown text]]`' },
    { group: LINKS, example: '[[Project X#Plans]]', what: 'A link that opens the page at its heading "Plans"', doc: '`[[Page#Heading]]`' },
    { group: LINKS, example: '[[2026-12-01]]', what: 'A link to a journal day', doc: '`[[2026-10-29]]`' },
    { group: LINKS, example: '#idea', what: 'A tag: a link to the page "idea"', doc: '`#tag`' },
    { group: LINKS, example: '#[[two words]]', what: 'A tag with spaces in its name', doc: '`#[[two words]]`' },
    {
      group: LINKS,
      example: '---\naliases: [k8s, kube]\n---',
      what: "At the very top of a page: other names for it, so [[k8s]] links to the page",
      doc: '`aliases`',
    },
    {
      group: TASKS,
      example: `${list[0]} Call Ben`,
      what: `A task: the block starts with a state (${list.join(', ')})`,
      doc: '**task**',
    },
    { group: TASKS, example: 'owner:: [[Anna]]', what: "A property, on the lines right after a block's first line", doc: '`key:: value`' },
    { group: TASKS, example: 'due:: [[2026-12-01]]', what: "A task's due date", doc: '`due:: [[2026-12-01]]`' },
    { group: TASKS, example: 'priority:: 2', what: "A task's priority on a board: 1 is the top", doc: '`priority:: 3`' },
    { group: MARKDOWN, example: '**bold**', what: 'Bold text', doc: '`**bold**`' },
    { group: MARKDOWN, example: '*italic*', what: 'Italic text', doc: '`*italic*`' },
    { group: MARKDOWN, example: '~~struck~~', what: 'Struck-through text', doc: '`~~struck~~`' },
    { group: MARKDOWN, example: '`code`', what: 'Inline code: nothing in it is a link or a tag', doc: '`` `code` ``' },
    { group: MARKDOWN, example: '## Heading', what: 'A heading (# to ######, then a space)', doc: '`## Heading`' },
    { group: MARKDOWN, example: '> quote', what: 'A quote', doc: '`> quote`' },
    { group: MARKDOWN, example: '[text](https://example.com)', what: 'A web link with its own text', doc: '`[text](https://…)`' },
    { group: MARKDOWN, example: '<https://example.com>', what: 'A web link', doc: '`<https://…>`' },
    { group: MARKDOWN, example: '<name@example.com>', what: 'A mail link', doc: '`<name@example.com>`' },
    {
      group: MARKDOWN,
      example: '```sh\nls -l\n```',
      what: 'A code block: no line in it starts a block, nothing is a link',
      doc: '`` ``` ``',
    },
  ]
}

function plain(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** The rows as groups, narrowed to those whose example, words or group hold `filter` (any case). */
export function writingGroups(states: readonly string[], filter: string): WritingGroup[] {
  const q = plain(filter)
  const groups: WritingGroup[] = []
  for (const r of writingRows(states)) {
    if (q && ![r.group, r.example, r.what].some((t) => plain(t).includes(q))) continue
    let g = groups.find((x) => x.name === r.group)
    if (!g) groups.push((g = { name: r.group, rows: [] }))
    g.rows.push(r)
  }
  return groups
}
