import { commands } from './registry'
import { buildHelpEntries } from './help'
import { newDocSameParent, newScratchpadDoc, saveDoc, printDoc, openOmniRecent, toggleZen } from './actions'
import type { AppContext, GlobalBinding } from './types'

function openHelp(ctx: AppContext) {
  ctx.store.getState().openOmni('help', { pinned: true })
  ctx.store.getState().setOmniItems(buildHelpEntries(commands, defaultGlobalBindings))
}

export const defaultGlobalBindings: GlobalBinding[] = [
  { key: 'Mod-n', run: newDocSameParent },
  { key: 'Mod-Shift-n', run: newScratchpadDoc },
  { key: 'Mod-s', run: saveDoc },
  { key: 'Mod-o', run: openOmniRecent },
  { key: 'Mod-p', run: printDoc },
  { key: 'Mod-/', run: openHelp },
  { key: 'Mod-Shift-z', run: toggleZen },
]
