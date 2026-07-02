import { newDocSameParent, newScratchpadDoc, saveDoc, openFzf, printDoc, type GlobalBinding } from './commands'

export const defaultGlobalBindings: GlobalBinding[] = [
  { key: 'Mod-n', run: newDocSameParent },
  { key: 'Mod-Shift-n', run: newScratchpadDoc },
  { key: 'Mod-s', run: saveDoc },
  { key: 'Mod-o', run: openFzf },
  { key: 'Mod-p', run: printDoc },
]
