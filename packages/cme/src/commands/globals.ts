import { keymap, type KeyBinding } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { AppContext } from '../types'

/**
 * App-level keybindings. High precedence so tab controls win over editor
 * defaults (e.g. Ctrl-ArrowUp is repurposed for tab cycling).
 *
 *   Ctrl-n         new tab (panel focused, inline rename)
 *   Ctrl-ArrowUp  previous tab
 *   Ctrl-ArrowDn  next tab
 *   Ctrl-Backspace close active tab
 *   Ctrl-Enter    rename active tab
 */
export function globalKeymap(ctx: AppContext): Extension {
  const s = () => ctx.store.getState()

  const binds: KeyBinding[] = [
    { key: 'Alt-n', preventDefault: true, run: () => (s().newTab(), true) },
    { key: 'Ctrl-ArrowUp', preventDefault: true, run: () => (s().cycleTab(-1), true) },
    { key: 'Ctrl-ArrowDown', preventDefault: true, run: () => (s().cycleTab(1), true) },
    { key: 'Ctrl-Backspace', preventDefault: true, run: () => (s().closeTab(s().activeId), true) },
    { key: 'Ctrl-Enter', preventDefault: true, run: () => (s().startRename(s().activeId), true) },
  ]

  return keymap.of(binds)
}
