import { keymap, type KeyBinding } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { AppContext } from '../types'

/**
 * App-level keybindings. High precedence so tab controls win over editor
 * defaults (e.g. Shift-ArrowUp is repurposed for tab cycling).
 *
 *   Ctrl-n         new tab (panel focused, inline rename)
 *   Shift-ArrowUp  previous tab
 *   Shift-ArrowDn  next tab
 *   Shift-Backspace close active tab
 *   Shift-Enter    rename active tab
 */
export function globalKeymap(ctx: AppContext): Extension {
  const s = () => ctx.store.getState()

  const binds: KeyBinding[] = [
    { key: 'Ctrl-n', preventDefault: true, run: () => (s().newTab(), true) },
    { key: 'Shift-ArrowUp', preventDefault: true, run: () => (s().cycleTab(-1), true) },
    { key: 'Shift-ArrowDown', preventDefault: true, run: () => (s().cycleTab(1), true) },
    { key: 'Shift-Backspace', preventDefault: true, run: () => (s().closeTab(s().activeId), true) },
    { key: 'Shift-Enter', preventDefault: true, run: () => (s().startRename(s().activeId), true) },
  ]

  return keymap.of(binds)
}
