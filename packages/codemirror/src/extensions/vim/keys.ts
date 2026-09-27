import type { EditorView } from '@codemirror/view'
import { jump, normalCommands, type NormalCommand } from './commands'
import { getVim, setVim, type VimState } from './state'

type Commands = Record<string, NormalCommand>

// non-printable keys that would otherwise edit the doc (smart enter, tab indent...)
const SWALLOWED = new Set(['Escape', 'Enter', 'Backspace', 'Delete', 'Tab'])

const prefixCache = new WeakMap<Commands, Set<string>>()

/** every proper prefix of a multi-key sequence, ie `d` and `d i` for `d i w` */
const prefixesOf = (commands: Commands) => {
  let prefixes = prefixCache.get(commands)
  if (!prefixes) {
    prefixes = new Set(
      Object.keys(commands).flatMap(seq => {
        const keys = seq.split(' ')
        return keys.slice(0, -1).map((_, i) => keys.slice(0, i + 1).join(' '))
      }),
    )
    prefixCache.set(commands, prefixes)
  }
  return prefixes
}

/** the command-map name for a key event, or null when the event should reach the editor untouched */
const keyName = (e: KeyboardEvent, commands: Commands): string | null => {
  if (e.altKey) return null
  if (e.ctrlKey || e.metaKey) {
    const name = `Ctrl-${e.key.toLowerCase()}`
    return e.ctrlKey && !e.metaKey && name in commands ? name : null
  }
  if (e.key === ' ') return e.shiftKey ? 'Shift-Space' : 'Space'
  if (e.key.length === 1 || SWALLOWED.has(e.key)) return e.key
  // arrows, home / end, page up / down keep working
  return null
}

const handlePromptKey = (e: KeyboardEvent, view: EditorView, vim: VimState) => {
  const prompt = vim.prompt!
  const setPrompt = (next: VimState['prompt']) => view.dispatch({ effects: setVim.of({ prompt: next }) })

  if (e.key === 'Escape') setPrompt(null)
  else if (e.key === 'Enter') {
    setPrompt(null)
    // an empty `/` repeats the last search, like vim
    const query = prompt.text || vim.search?.query
    if (query) jump(view, { query, wholeWord: !prompt.text && !!vim.search?.wholeWord, dir: prompt.dir })
  } else if (e.key === 'Backspace') setPrompt(prompt.text ? { ...prompt, text: prompt.text.slice(0, -1) } : null)
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) setPrompt({ ...prompt, text: prompt.text + e.key })
  return true
}

/** keydown handler for normal mode, returns true when the key was consumed */
export const handleNormalKey = (event: KeyboardEvent, view: EditorView): boolean => {
  const vim = getVim(view.state)
  if (!vim || vim.mode !== 'normal' || event.isComposing) return false
  if (vim.prompt) return handlePromptKey(event, view, vim)

  const commands = view.state.facet(normalCommands)
  const name = keyName(event, commands)
  if (name === null) return false

  const seq = vim.pending ? `${vim.pending} ${name}` : name
  const command = commands[seq]
  const pending = !command && prefixesOf(commands).has(seq) ? seq : ''
  if (pending !== vim.pending || vim.message) view.dispatch({ effects: setVim.of({ pending, message: null }) })
  command?.(view)
  return true
}
