import { Text } from '@codemirror/state'
import { describe, expect, test } from 'bun:test'
import { clampNormal, nextWordStart, prevWordStart, wordEnd, wordRangeAt } from './motions'

// 'foo bar' is 0..7, the newline is 7, '  baz' is 8..13
const doc = Text.of(['foo bar', '  baz'])

describe('motions', () => {
  test('w', () => {
    expect(nextWordStart(doc, 0)).toBe(4)
    expect(nextWordStart(doc, 4)).toBe(10)
    expect(nextWordStart(Text.of(['foo.bar']), 0)).toBe(3)
    expect(nextWordStart(Text.of(['foo.bar']), 3)).toBe(4)
  })

  test('b', () => {
    expect(prevWordStart(doc, 10)).toBe(4)
    expect(prevWordStart(doc, 5)).toBe(4)
    expect(prevWordStart(doc, 0)).toBe(0)
  })

  test('e', () => {
    expect(wordEnd(doc, 0)).toBe(2)
    expect(wordEnd(doc, 2)).toBe(6)
  })

  test('iw', () => {
    expect(wordRangeAt(doc, 5)).toEqual({ from: 4, to: 7 })
    expect(wordRangeAt(doc, 3)).toEqual({ from: 3, to: 4 })
    expect(wordRangeAt(doc, 7)).toBeNull()
  })

  test('clamp', () => {
    expect(clampNormal(doc, 7)).toBe(6)
    expect(clampNormal(Text.of(['a', '', 'b']), 2)).toBe(2)
  })
})
