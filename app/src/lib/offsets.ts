function utf8Len(cp: number): number {
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
}

/** A UTF-16 code-unit offset into `text` as a UTF-8 byte offset. */
export function utf16ToUtf8(text: string, pos16: number): number {
  let bytes = 0
  let i = 0
  while (i < pos16 && i < text.length) {
    const cp = text.codePointAt(i)!
    bytes += utf8Len(cp)
    i += cp > 0xffff ? 2 : 1
  }
  return bytes
}

/** A UTF-8 byte offset into `text` as a UTF-16 code-unit offset. */
export function utf8ToUtf16(text: string, pos8: number): number {
  let bytes = 0
  let i = 0
  while (bytes < pos8 && i < text.length) {
    const cp = text.codePointAt(i)!
    bytes += utf8Len(cp)
    i += cp > 0xffff ? 2 : 1
  }
  return i
}
