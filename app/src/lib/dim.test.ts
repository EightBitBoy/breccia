import { expect, test } from 'vitest'
import { dimRanges } from './dim'

const kws = ['TODO', 'DONE']

test('link brackets are dimmed', () => {
  expect(dimRanges('see [[Ben]] now', kws)).toEqual([
    [4, 6],
    [9, 11],
  ])
})

test('the hash of a tag is dimmed, a lone hash is not', () => {
  expect(dimRanges('#a and #b', kws)).toEqual([
    [0, 1],
    [7, 8],
  ])
  expect(dimRanges('a # b x#y', kws)).toEqual([])
})

test('a task keyword is dimmed only at the start of the first line', () => {
  expect(dimRanges('TODO call', kws)).toEqual([[0, 4]])
  expect(dimRanges('TODO', kws)).toEqual([[0, 4]])
  expect(dimRanges('TODOS', kws)).toEqual([])
  expect(dimRanges('call TODO', kws)).toEqual([])
  expect(dimRanges('TODO call', kws, false)).toEqual([])
})

test('no keywords still dims brackets', () => {
  expect(dimRanges('TODO [[x]]', [])).toEqual([
    [5, 7],
    [8, 10],
  ])
})
