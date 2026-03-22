// @paladin/codemirror-editor-experiment/tests/smartEnter.test.ts
import { describe, it } from 'bun:test'
import { mkView, typeKey, expectView } from './helpers'
import { smartEnter } from '../keybindings/smartEnter'

const ext = [smartEnter()]

describe('smartEnter', () => {
  describe('bullet continuation', () => {
    it('continues - bullet', () => {
      const view = mkView('- hello|', ext)
      typeKey(view, 'Enter')
      expectView(view, '- hello\n- |')
    })

    it('continues * bullet', () => {
      const view = mkView('* hello|', ext)
      typeKey(view, 'Enter')
      expectView(view, '* hello\n* |')
    })

    it('preserves indentation on bullets', () => {
      const view = mkView('\t- hello|', ext)
      typeKey(view, 'Enter')
      expectView(view, '\t- hello\n\t- |')
    })
  })

  describe('numbered list continuation', () => {
    it('continues 1. -> 2.', () => {
      const view = mkView('1. first|', ext)
      typeKey(view, 'Enter')
      expectView(view, '1. first\n2. |')
    })

    it('continues 9. -> 10.', () => {
      const view = mkView('9. ninth|', ext)
      typeKey(view, 'Enter')
      expectView(view, '9. ninth\n10. |')
    })

    it('continues 1) -> 2)', () => {
      const view = mkView('1) first|', ext)
      typeKey(view, 'Enter')
      expectView(view, '1) first\n2) |')
    })
  })

  describe('lettered list continuation', () => {
    it('continues a) -> b)', () => {
      const view = mkView('a) first|', ext)
      typeKey(view, 'Enter')
      expectView(view, 'a) first\nb) |')
    })

    it('continues z) wraps or continues', () => {
      const view = mkView('z) last|', ext)
      typeKey(view, 'Enter')
      expectView(view, 'z) last\naa) |')
    })
  })

  describe('bracketed list continuation', () => {
    it('continues [1] -> [2]', () => {
      const view = mkView('[1] first|', ext)
      typeKey(view, 'Enter')
      expectView(view, '[1] first\n[2] |')
    })

    it('continues [a] -> [b]', () => {
      const view = mkView('[a] first|', ext)
      typeKey(view, 'Enter')
      expectView(view, '[a] first\n[b] |')
    })
  })

  describe('roman numeral continuation', () => {
    it('continues i) -> ii)', () => {
      const view = mkView('i) first|', ext)
      typeKey(view, 'Enter')
      expectView(view, 'i) first\nii) |')
    })

    it('continues iii) -> iv)', () => {
      const view = mkView('iii) third|', ext)
      typeKey(view, 'Enter')
      expectView(view, 'iii) third\niv) |')
    })

    it('continues v) -> vi)', () => {
      const view = mkView('v) fifth|', ext)
      typeKey(view, 'Enter')
      expectView(view, 'v) fifth\nvi) |')
    })
  })

  describe('comment continuation', () => {
    it('continues # comment', () => {
      const view = mkView('# hello|', ext)
      typeKey(view, 'Enter')
      expectView(view, '# hello\n# |')
    })

    it('continues // comment', () => {
      const view = mkView('// hello|', ext)
      typeKey(view, 'Enter')
      expectView(view, '// hello\n// |')
    })
  })

  describe('empty line exits list', () => {
    it('removes marker on empty bullet line', () => {
      const view = mkView('- hello\n- |', ext)
      typeKey(view, 'Enter')
      expectView(view, '- hello\n|')
    })

    it('removes marker on empty numbered line', () => {
      const view = mkView('1. hello\n2. |', ext)
      typeKey(view, 'Enter')
      expectView(view, '1. hello\n|')
    })
  })
})
