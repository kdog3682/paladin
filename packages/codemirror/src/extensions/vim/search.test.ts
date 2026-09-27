import { describe, expect, test } from 'bun:test'
import { findMatch, keywordAt } from './search'

describe('findMatch', () => {
  const text = 'abc abc abc'

  test('forward and backward', () => {
    expect(findMatch(text, 'abc', 0, 1)).toBe(4)
    expect(findMatch(text, 'abc', 4, 1)).toBe(8)
    expect(findMatch(text, 'abc', 8, -1)).toBe(4)
  })

  test('wraps around', () => {
    expect(findMatch(text, 'abc', 8, 1)).toBe(0)
    expect(findMatch(text, 'abc', 0, -1)).toBe(8)
  })

  test('smartcase', () => {
    expect(findMatch('Foo foo', 'foo', 0, 1)).toBe(4)
    expect(findMatch('foo Foo', 'Foo', 0, 1)).toBe(4)
    expect(findMatch('foo foo', 'Foo', 0, 1)).toBeNull()
  })

  test('whole word', () => {
    expect(findMatch('foobar foo', 'foo', 0, 1, { wholeWord: true })).toBe(7)
  })

  test('missing', () => {
    expect(findMatch(text, 'xyz', 0, 1)).toBeNull()
    expect(findMatch(text, '', 0, 1)).toBeNull()
  })
})

describe('keywordAt', () => {
  test('under or after the cursor', () => {
    expect(keywordAt('  foo.bar', 3)).toEqual({ from: 2, word: 'foo' })
    expect(keywordAt('  foo.bar', 0)).toEqual({ from: 2, word: 'foo' })
    expect(keywordAt('  foo.bar', 5)).toEqual({ from: 6, word: 'bar' })
    expect(keywordAt('foo  ', 4)).toBeNull()
  })
})
