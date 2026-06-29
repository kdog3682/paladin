// @paladin/codemirror-editor-experiment/tests/backslashContinue.test.ts
import { describe, it } from 'bun:test'
import { mkView, typeKey, expectView } from './helpers'
import { backslashContinue } from '../keybindings/backslashContinue'

const ext = [backslashContinue()]

describe('backslashContinue', () => {
  it('creates indented continuation in bullet list', () => {
    const view = mkView('- hello|', ext)
    typeKey(view, '\\')
    expectView(view, '- hello\n\t|')
  })

  it('creates indented continuation in numbered list', () => {
    const view = mkView('1. hello|', ext)
    typeKey(view, '\\')
    expectView(view, '1. hello\n\t|')
  })

  it('preserves existing indentation plus one level', () => {
    const view = mkView('\t- hello|', ext)
    typeKey(view, '\\')
    expectView(view, '\t- hello\n\t\t|')
  })

  it('does not trigger continuation when not in a list', () => {
    const view = mkView('hello|', ext)
    typeKey(view, '\\')
    // keymap returns false — doc unchanged (no newline inserted)
    // in a real browser CM would insert literal \, but our extension correctly fell through
    const doc = view.state.doc.toString()
    if (doc !== 'hello') {
      throw new Error(`Expected doc to be unchanged "hello", got ${JSON.stringify(doc)}`)
    }
  })

  it('works with bracketed lists', () => {
    const view = mkView('[1] hello|', ext)
    typeKey(view, '\\')
    expectView(view, '[1] hello\n\t|')
  })
})
