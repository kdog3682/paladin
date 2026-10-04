import { describe, expect, test } from 'bun:test'
import { runCommand } from '../../test/editor'
import { insertIndentedNewline } from './indentNewline'

const enter = (spec: string) => runCommand(spec, insertIndentedNewline)

describe('insertIndentedNewline', () => {
  test('continues a numbered list', () => {
    expect(enter('1. foo|')).toBe('1. foo\n2. |')
    expect(enter('  9) foo|')).toBe('  9) foo\n  10) |')
  })

  test('continues a checklist with an empty box', () => {
    expect(enter('[ ] foo|')).toBe('[ ] foo\n[ ] |')
    expect(enter('[x] foo|')).toBe('[x] foo\n[ ] |')
    expect(enter('[] foo|')).toBe('[] foo\n[] |')
    expect(enter('- [x] foo|')).toBe('- [x] foo\n- [ ] |')
  })

  test('an empty item drops its marker', () => {
    expect(enter('2. |')).toBe('|')
    expect(enter('  [ ] |')).toBe('  |')
  })

  test('still repeats the plain markers', () => {
    expect(enter('- foo|')).toBe('- foo\n- |')
    expect(enter('// foo|')).toBe('// foo\n// |')
  })
})
