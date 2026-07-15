// @paladin/cme/tests/qwqe.test.ts
import { describe, it } from 'bun:test'
import { mkView, typeText, expectView } from './helpers'
import { qSequence } from '../keybindings/qSequence'

const ext = [qSequence()]

describe('qw — newline-tab-enter', () => {
  describe('basic indentation', () => {
    it('creates newline and indents from unindented line', () => {
      const view = mkView('howdy|\ngoodbye', ext)
      typeText(view, 'qw')
      expectView(view, 'howdy\n\t|\ngoodbye')
    })

    it('indents one level deeper than current', () => {
      const view = mkView('\thowdy|', ext)
      typeText(view, 'qw')
      expectView(view, '\thowdy\n\t\t|')
    })
  })

  describe('yaml colon guidepost', () => {
    it('indents after a key: line', () => {
      const view = mkView('parent:|', ext)
      typeText(view, 'qw')
      expectView(view, 'parent:\n\t|')
    })

    it('indents after an indented key: line', () => {
      const view = mkView('\tparent:|', ext)
      typeText(view, 'qw')
      expectView(view, '\tparent:\n\t\t|')
    })

    it('indents after key: value (uses line indent + 1)', () => {
      const view = mkView('parent: value|', ext)
      typeText(view, 'qw')
      expectView(view, 'parent: value\n\t|')
    })
  })

  describe('newline deduplication', () => {
    it('does not create extra newline if one exists after cursor', () => {
      const view = mkView('howdy|\n\ngoodbye', ext)
      typeText(view, 'qw')
      expectView(view, 'howdy\n\t|\ngoodbye')
    })

    it('consumes only the first newline when multiple exist', () => {
      const view = mkView('howdy|\n\n\ngoodbye', ext)
      typeText(view, 'qw')
      expectView(view, 'howdy\n\t|\n\ngoodbye')
    })
  })

  describe('cursor position edge cases', () => {
    it('works at start of document', () => {
      const view = mkView('|hello', ext)
      typeText(view, 'qw')
      expectView(view, '\n\t|hello')
    })

    it('works at end of document with no trailing newline', () => {
      const view = mkView('hello|', ext)
      typeText(view, 'qw')
      expectView(view, 'hello\n\t|')
    })

    it('works on an empty document', () => {
      const view = mkView('|', ext)
      typeText(view, 'qw')
      expectView(view, '\n\t|')
    })

    it('splits line when cursor is mid-line', () => {
      const view = mkView('hel|lo', ext)
      typeText(view, 'qw')
      expectView(view, 'hel\n\t|lo')
    })

    it('works on an empty line', () => {
      const view = mkView('above\n|\nbelow', ext)
      typeText(view, 'qw')
      expectView(view, 'above\n\n\t|\nbelow')
    })

    it('works on a whitespace-only line', () => {
      const view = mkView('\t|', ext)
      typeText(view, 'qw')
      expectView(view, '\t\n\t\t|')
    })
  })

  describe('q passthrough', () => {
    it('typing q then non-w/e inserts q normally', () => {
      const view = mkView('|', ext)
      typeText(view, 'qa')
      expectView(view, 'qa|')
    })

    it('typing q then q flushes first q and buffers second', () => {
      const view = mkView('|', ext)
      typeText(view, 'qq')
      // first q flushed as literal, second q buffered
      typeText(view, 'w')
      // second q + w triggers qw command
      expectView(view, 'q\n\t|')
    })
  })
})

describe('qe — newline-tab-exit', () => {
  describe('basic dedentation', () => {
    it('creates newline and dedents from indented line', () => {
      const view = mkView('\t\thowdy|', ext)
      typeText(view, 'qe')
      expectView(view, '\t\thowdy\n\t|')
    })

    it('dedents to zero from single indent', () => {
      const view = mkView('\thowdy|', ext)
      typeText(view, 'qe')
      expectView(view, '\thowdy\n|')
    })

    it('stays at zero indent if already unindented', () => {
      const view = mkView('howdy|', ext)
      typeText(view, 'qe')
      expectView(view, 'howdy\n|')
    })
  })

  describe('yaml colon guidepost', () => {
    it('dedents after nested key: to parent level', () => {
      const view = mkView('\t\tchild:|', ext)
      typeText(view, 'qe')
      expectView(view, '\t\tchild:\n\t|')
    })
  })

  describe('newline deduplication', () => {
    it('does not create extra newline if one exists after cursor', () => {
      const view = mkView('\thowdy|\n\ngoodbye', ext)
      typeText(view, 'qe')
      expectView(view, '\thowdy\n|\ngoodbye')
    })

    it('consumes only the first newline when multiple exist', () => {
      const view = mkView('\thowdy|\n\n\ngoodbye', ext)
      typeText(view, 'qe')
      expectView(view, '\thowdy\n|\n\ngoodbye')
    })
  })

  describe('cursor position edge cases', () => {
    it('works at start of document', () => {
      const view = mkView('|hello', ext)
      typeText(view, 'qe')
      expectView(view, '\n|hello')
    })

    it('works at end of document', () => {
      const view = mkView('\thello|', ext)
      typeText(view, 'qe')
      expectView(view, '\thello\n|')
    })

    it('works on an empty document', () => {
      const view = mkView('|', ext)
      typeText(view, 'qe')
      expectView(view, '\n|')
    })

    it('splits line when cursor is mid-line', () => {
      const view = mkView('\thel|lo', ext)
      typeText(view, 'qe')
      expectView(view, '\thel\n|lo')
    })

    it('works on an empty line', () => {
      const view = mkView('above\n|\nbelow', ext)
      typeText(view, 'qe')
      expectView(view, 'above\n\n|\nbelow')
    })

    it('works on a whitespace-only line', () => {
      const view = mkView('\t\t|', ext)
      typeText(view, 'qe')
      expectView(view, '\t\t\n\t|')
    })
  })
})
