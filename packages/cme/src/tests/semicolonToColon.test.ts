// @paladin/codemirror-editor-experiment/tests/semicolonToColon.test.ts
import { describe, it } from 'bun:test'
import { mkView, typeKey, expectView } from './helpers'
import { semicolonToColon } from '../keybindings/semicolonToColon'

const ext = [semicolonToColon()]

describe('semicolonToColon', () => {
  it('replaces ; with : in empty doc', () => {
    const view = mkView('|', ext)
    typeKey(view, ';')
    expectView(view, ':|')
  })

  it('replaces ; with : mid-line', () => {
    const view = mkView('key|', ext)
    typeKey(view, ';')
    expectView(view, 'key:|')
  })

  it('replaces ; with : between text', () => {
    const view = mkView('key| value', ext)
    typeKey(view, ';')
    expectView(view, 'key:| value')
  })

  it('works on multiple presses', () => {
    const view = mkView('a| b', ext)
    typeKey(view, ';')
    typeKey(view, ';')
    expectView(view, 'a::| b')
  })
})
