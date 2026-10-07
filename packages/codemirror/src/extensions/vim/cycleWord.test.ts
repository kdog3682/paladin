import { describe, expect, test } from 'bun:test'
import { cycleToken, incrementNumber } from './cycleWord'

const cycle = (text: string, col = 0, dir: 1 | -1 = 1) => cycleToken(text, col, dir)?.insert ?? null

describe('cycleToken', () => {
  test('cycles known words', () => {
    expect(cycle('width')).toBe('height')
    expect(cycle('height')).toBe('width')
    expect(cycle('north')).toBe('east')
    expect(cycle('west')).toBe('north')
    expect(cycle('north', 0, -1)).toBe('west')
  })

  test('keeps case', () => {
    expect(cycle('Width')).toBe('Height')
    expect(cycle('NORTH')).toBe('EAST')
  })

  test('cycles single letters', () => {
    expect(cycle('a')).toBe('b')
    expect(cycle('e')).toBe('f')
    expect(cycle('z')).toBe('a')
    expect(cycle('Z')).toBe('A')
    expect(cycle('a', 0, -1)).toBe('z')
  })

  test('increments numbers with units', () => {
    expect(cycle('5')).toBe('6')
    expect(cycle('5px')).toBe('6px')
    expect(cycle('5pt', 0, -1)).toBe('4pt')
    expect(cycle('0.023m')).toBe('0.024m')
    expect(cycle('50%')).toBe('51%')
    expect(cycle('-1')).toBe('0')
    expect(cycle('0', 0, -1)).toBe('-1')
  })

  test('uses the token under the cursor', () => {
    expect(cycleToken('width: 5px', 8)).toEqual({ from: 7, to: 10, insert: '6px' })
    expect(cycleToken('width: 5px', 2)).toEqual({ from: 0, to: 5, insert: 'height' })
  })

  test('searches forward on the line when nothing is under the cursor', () => {
    expect(cycleToken('foo bar 5', 0)).toEqual({ from: 8, to: 9, insert: '6' })
  })

  test('a dash glued to a word is not a sign', () => {
    expect(cycleToken('x-5', 2)).toEqual({ from: 2, to: 3, insert: '6' })
  })

  test('returns null when nothing is cyclable', () => {
    expect(cycle('foo bar')).toBeNull()
    expect(cycle('width', 5)).toBeNull()
  })
})

describe('incrementNumber', () => {
  test('keeps decimal precision', () => {
    expect(incrementNumber(false, '0.009', 1)).toBe('0.010')
    expect(incrementNumber(false, '1.5', -1)).toBe('1.4')
    expect(incrementNumber(true, '0.1', 1)).toBe('0.0')
  })
})

describe('checklist boxes', () => {
  test('the mark flips between check and cross', () => {
    expect(cycleToken('[✓] foo', 0)).toEqual({ from: 1, to: 2, insert: '✗' })
    expect(cycleToken('- [✗] foo', 0)).toEqual({ from: 3, to: 4, insert: '✓' })
  })

  test('past the box the words cycle as usual', () => {
    expect(cycle('[✓] width', 5)).toBe('height')
  })
})
