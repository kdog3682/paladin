// @paladin/cme/tests/slashAutocomplete.test.ts
import { describe, it, expect } from 'bun:test'
import { getWordCompletions } from '../keybindings/slashAutocomplete'

describe('slashAutocomplete', () => {
  describe('getWordCompletions — pure function', () => {
    it('returns words with 5+ characters', () => {
      const words = getWordCompletions('hello world tiny configuration')
      const labels = words.map(w => w.label)
      expect(labels).toContain('hello')
      expect(labels).toContain('world')
      expect(labels).toContain('configuration')
      expect(labels).not.toContain('tiny')
    })

    it('deduplicates words', () => {
      const words = getWordCompletions('hello hello hello')
      const labels = words.map(w => w.label)
      expect(labels.filter(l => l === 'hello').length).toBe(1)
    })

    it('returns empty for short words only', () => {
      const words = getWordCompletions('a bb ccc dddd')
      expect(words.length).toBe(0)
    })

    it('includes underscored identifiers', () => {
      const words = getWordCompletions('my_variable short')
      const labels = words.map(w => w.label)
      expect(labels).toContain('my_variable')
    })
  })
})
