import { describe, expect, it } from 'vitest'
import { summarize } from './trace.mjs'

describe('summarize', () => {
  const log = [
    'trace run block.setText wait=0.1ms run=2.0ms',
    'trace run block.setText wait=0.3ms run=4.0ms',
    'trace watch paths=3 wait=1.0ms run=5.0ms',
    'trace index pages=50 wait=0.0ms run=9.5ms',
    'trace index pages=20 wait=0.2ms run=8.5ms',
    'some other app output',
    'trace run broken wait=ms run=1ms',
  ].join('\r\n')
  const out = summarize(log)
  const row = (k) => out.split('\n').find((l) => l.startsWith(k + ' '))?.trim().split(/\s{2,}/)
  it('groups runs by name and watch and index by kind', () => {
    expect(row('run block.setText')?.[1]).toBe('2')
    expect(row('watch')?.[1]).toBe('1')
    expect(row('index')?.[1]).toBe('2')
  })
  it('reports percentiles', () => {
    expect(row('index')?.slice(4)).toEqual(['8.5', '9.5'])
  })
  it('counts trace lines it cannot read instead of dropping them', () => {
    expect(out.trim().split('\n').at(-1)).toBe('unparsed trace lines: 1')
  })
  it('ignores lines that are not trace lines', () => {
    expect(out).not.toContain('some other')
  })
})
