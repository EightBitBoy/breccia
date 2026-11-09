/** Whether the app runs on an Apple platform (Cmd instead of Ctrl). */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
