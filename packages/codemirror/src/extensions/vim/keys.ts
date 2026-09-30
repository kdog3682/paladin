import type { EditorView } from '@codemirror/view'
import { normalCommands, submitPrompt, visualCommands, type NormalCommand } from './commands'
import { getVim, setVim, type VimState } from './state'

type Commands = Record<string, NormalCommand>

// non-printable keys that would otherwise edit the doc (smart enter, tab indent...)
/** named (multi-character) keys vim takes over, so they never reach the default keymap.
 * the arrows are here because otherwise `cursorCharRight` and friends would run and
 * collapse a visual selection */
const SWALLOWED = new Set([
  'Escape',
  'Enter',
  'Backspace',
  'Delete',
  'Tab',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
])

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
  // some environments report shift+v as key 'v' with shiftKey set rather than 'V', which
  // would quietly run the lowercase binding. upper-casing is a no-op everywhere else,
  // punctuation included: shift+3 already arrives as '#'
  if (e.key.length === 1) return e.shiftKey ? e.key.toUpperCase() : e.key
  if (SWALLOWED.has(e.key)) return e.key
  // arrows, home / end, page up / down keep working
  return null
}

const handlePromptKey = (e: KeyboardEvent, view: EditorView, vim: VimState) => {
  const prompt = vim.prompt!
  const setPrompt = (next: VimState['prompt']) => view.dispatch({ effects: setVim.of({ prompt: next }) })

  if (e.key === 'Escape') setPrompt(null)
  else if (e.key === 'Enter') {
    setPrompt(null)
    submitPrompt(view, prompt, vim)
  } else if (e.key === 'Backspace') setPrompt(prompt.text ? { ...prompt, text: prompt.text.slice(0, -1) } : null)
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) setPrompt({ ...prompt, text: prompt.text + e.key })
  return true
}

/** keydown handler for normal and visual mode, returns true when the key was consumed */
export const handleNormalKey = (event: KeyboardEvent, view: EditorView): boolean => {
  const vim = getVim(view.state)
  if (!vim || vim.mode === 'insert' || event.isComposing) return false
  if (vim.prompt) return handlePromptKey(event, view, vim)

  const commands = view.state.facet(vim.mode === 'visual' ? visualCommands : normalCommands)
  const name = keyName(event, commands)
  if (name === null) return false

  const seq = vim.pending ? `${vim.pending} ${name}` : name
  const command = commands[seq]
  const pending = !command && prefixesOf(commands).has(seq) ? seq : ''
  if (pending !== vim.pending || vim.message) view.dispatch({ effects: setVim.of({ pending, message: null }) })
  command?.(view)
  return true
}
