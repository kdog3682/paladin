import { expect, test } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { bracketIndent } from './bracketIndent'

function enter(doc: string, pos: number) {
  let state = EditorState.create({
    doc,
    selection: { anchor: pos },
    extensions: [indentUnit.of('  '), bracketIndent()],
  })
  insertNewlineAndIndent({ state, dispatch: (tr) => (state = tr.state) })
  return state.doc.toString()
}

test.each([['{', '}'], ['(', ')'], ['[', ']']])('Enter between %s%s opens the pair', (o, c) => {
  expect(enter(o + c, 1)).toBe(`${o}\n  \n${c}`)
  expect(enter(`  ${o}${c}`, 3)).toBe(`  ${o}\n    \n  ${c}`)
})

test('Enter after an unclosed opener indents', () => {
  expect(enter('{', 1)).toBe('{\n  ')
})

test('Enter after plain text keeps the indent', () => {
  expect(enter('  foo', 5)).toBe('  foo\n  ')
})
