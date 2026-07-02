import { defaultScratchpadName, isUnnamedScratchpad } from '../scratchpad'
import { flushSave, flushToDisk } from '../persistence'
import { activateCmdline } from './dispatch'
import type { AppContext } from './types'

export async function newDocSameParent(ctx: AppContext) {
  const { project, title } = ctx.doc()
  if (isUnnamedScratchpad(project, title)) {
    ctx.store.getState().setCmdline({ cmdError: 'name this doc before creating another' })
    return
  }
  const parent = await ctx.api.call('doc.currentParent')
  const docId = await ctx.api.call('doc.create', [{ project, parent }])
  ctx.store.getState().setDocMeta({ docId })
  ctx.store.getState().postLog({ type: 'doc.create', payload: { docId, project } })
}

export async function newScratchpadDoc(ctx: AppContext) {
  const title = defaultScratchpadName()
  const docId = await ctx.api.call('doc.create', [{ project: 'scratchpad', title }])
  ctx.store.getState().setDocMeta({ docId, docProject: 'scratchpad', docTitle: title })
  ctx.store.getState().postLog({ type: 'doc.create', payload: { docId, project: 'scratchpad' } })
  activateCmdline(ctx, 'st') // give the user a chance to name it right away
}

export async function saveDoc(ctx: AppContext) {
  const view = ctx.store.getState().view
  if (!view) return
  await flushSave(ctx, view)
  await flushToDisk(ctx)
}

export async function printDoc(ctx: AppContext) {
  await ctx.api.call('doc.print', [ctx.doc().id], undefined, (err) =>
    ctx.store.getState().setCmdline({ cmdError: `print failed: ${String(err)}` })
  )
}

export async function openOmniRecent(ctx: AppContext) {
  ctx.store.getState().openOmni('recent', { pinned: true })
  const items = await ctx.api.call('documents.list')
  ctx.store.getState().setOmniItems(items)
}

export function toggleZen(ctx: AppContext) {
  const order = ['none', 'partial', 'full'] as const
  const current = ctx.store.getState().zenMode
  const next = order[(order.indexOf(current) + 1) % order.length]
  ctx.store.getState().setZenMode(next)
  ctx.api.call('config.set', ['zenMode', next])
}
