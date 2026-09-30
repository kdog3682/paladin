import { describe, expect, test } from 'bun:test'
import { runCommand } from '../test/editor'
import {
  executeCursorRight,
  executeJoinPrevious,
  executeNewlineDedent,
  executeNewlineIndent,
  executeWrapParens,
} from './qchord'

const indent = (spec: string) => runCommand(spec, executeNewlineIndent)
const dedent = (spec: string) => runCommand(spec, executeNewlineDedent)
const right = (spec: string) => runCommand(spec, executeCursorRight)
const join = (spec: string) => runCommand(spec, executeJoinPrevious)
const parens = (spec: string) => runCommand(spec, executeWrapParens)

describe('executeNewlineIndent (qw)', () => {
  test('opens an indented line below', () => {
    expect(indent('foo|')).toBe('foo\n  |')
    expect(indent('  foo|')).toBe('  foo\n    |')
  })

  test('appends below the line, wherever the cursor sits on it', () => {
    expect(indent('f|oo')).toBe('foo\n  |')
    expect(indent('|foo')).toBe('foo\n  |')
  })

  test('a tab-indented line keeps its tabs and gains two spaces', () => {
    expect(indent('\tfoo|')).toBe('\tfoo\n\t  |')
  })

  test('a bullet continues as an indented bullet', () => {
    expect(indent('- long-addition|')).toBe('- long-addition\n  - |')
    expect(indent('  - foo|')).toBe('  - foo\n    - |')
    expect(indent('* foo|')).toBe('* foo\n  * |')
    expect(indent('+ foo|')).toBe('+ foo\n  + |')
  })

  test('an ordered marker is carried down as written', () => {
    expect(indent('1. foo|')).toBe('1. foo\n  1. |')
    expect(indent('2) foo|')).toBe('2) foo\n  2) |')
  })

  test('a dash that is not a marker is just text', () => {
    expect(indent('-foo|')).toBe('-foo\n  |')
    expect(indent('a - b|')).toBe('a - b\n  |')
  })

  test('an empty document just opens an indented line', () => {
    expect(indent('|')).toBe('\n  |')
  })

  test('a blank next line is reused, and rewritten', () => {
    expect(indent('foo|\n')).toBe('foo\n  |')
    expect(indent('foo|\n    ')).toBe('foo\n  |')
    expect(indent('  foo|\n')).toBe('  foo\n    |')
    expect(indent('- foo|\n')).toBe('- foo\n  - |')
  })

  test('a non-blank next line is pushed down', () => {
    expect(indent('foo|\nbar')).toBe('foo\n  |\nbar')
  })
})

describe('executeNewlineDedent (qe)', () => {
  test('opens a line one level shallower', () => {
    expect(dedent('    foo|')).toBe('    foo\n  |')
    expect(dedent('  foo|')).toBe('  foo\n|')
  })

  test('at the left margin there is nothing to dedent', () => {
    expect(dedent('foo|')).toBe('foo\n|')
  })

  test('a trailing tab is dropped whole', () => {
    expect(dedent('\t\tfoo|')).toBe('\t\tfoo\n\t|')
  })

  test('a ragged indent collapses to the margin', () => {
    expect(dedent('   foo|')).toBe('   foo\n |')
  })

  test('a blank next line is reused, and reindented', () => {
    expect(dedent('    foo|\n  ')).toBe('    foo\n  |')
    expect(dedent('    foo|\n')).toBe('    foo\n  |')
    expect(dedent('    foo|\n        ')).toBe('    foo\n  |')
  })

  test('a bullet continues as a dedented bullet', () => {
    expect(dedent('  - foo|')).toBe('  - foo\n- |')
    expect(dedent('    - foo|')).toBe('    - foo\n  - |')
    expect(dedent('- foo|')).toBe('- foo\n- |')
  })
})

describe('executeCursorRight (ql)', () => {
  test('steps over the next character', () => {
    expect(right('|foo')).toBe('f|oo')
    expect(right('f|oo')).toBe('fo|o')
  })

  test('stepping onto the end of a line appends a space', () => {
    expect(right('fo|o')).toBe('foo |')
  })

  test('a line that already ends in a space is only stepped onto', () => {
    expect(right('fo|o ')).toBe('foo| ')
    expect(right('foo| ')).toBe('foo |')
  })

  test('at the very end of the document nothing happens', () => {
    expect(right('foo|')).toBe('foo|')
  })

  test('stepping over the last character of a non-final line', () => {
    expect(right('fo|o\nbar')).toBe('foo |\nbar')
  })

  test('steps across a newline', () => {
    expect(right('foo|\nbar')).toBe('foo\n|bar')
  })

  test('an empty line is stepped over without a space', () => {
    expect(right('foo|\n\nbar')).toBe('foo\n|\nbar')
  })
})

describe('executeJoinPrevious (qd)', () => {
  test('joins the line onto the one above with a single space', () => {
    expect(join('abc\n | ghi')).toBe('abc |ghi')
    expect(join('abc\nghi|')).toBe('abc |ghi')
  })

  test('trailing space on the line above is not doubled', () => {
    expect(join('abc  \n|ghi')).toBe('abc |ghi')
  })

  test('joining onto a blank line leaves no leading space', () => {
    expect(join('\n  |ghi')).toBe('|ghi')
  })

  test('joining a blank line up leaves no trailing space', () => {
    expect(join('abc\n  |')).toBe('abc|')
  })

  test('the first line has nothing to join to', () => {
    expect(join('abc|')).toBe('abc|')
  })

  test('lines below are untouched', () => {
    expect(join('abc\n|ghi\nxyz')).toBe('abc |ghi\nxyz')
  })
})

describe('executeWrapParens (qp)', () => {
  test('wraps the rest of the line, cursor after the closer', () => {
    expect(parens('foobar|boo')).toBe('foobar(boo)|')
    expect(parens('|boo')).toBe('(boo)|')
  })

  test('with nothing left on the line it opens an empty pair', () => {
    expect(parens('foo|')).toBe('foo(|)')
  })

  test('only the cursor line is wrapped', () => {
    expect(parens('foo|bar\nbaz')).toBe('foo(bar)|\nbaz')
  })
})
