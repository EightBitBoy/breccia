// The notes folder's generation: each folder opened gets a new one (Output.folder).

/** Whether a folder answer with `generation` names another notes folder than `last` (null before the first). */
export function isNewFolder(last: number | null, generation: number): boolean {
  return last !== null && generation !== last
}
