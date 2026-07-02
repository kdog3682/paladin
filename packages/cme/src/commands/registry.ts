import type { CommandSpec } from './types'
import { flushToDisk } from '../persistence'

export const commands: CommandSpec[] = [
  {
    name: 'insert',
    abbr: 'i',
    args: [],
    run: (ctx) => {
      ctx.store.getState().view?.focus()
      ctx.store.getState().setMode('insert')
    },
  },
  {
    name: 'export',
    abbr: 'e',
    args: [],
    run: (ctx) => ctx.api.call('doc.compileExport', [ctx.doc().id]),
  },
  {
    name: 'print',
    abbr: 'pr',
    args: [],
    run: (ctx) =>
      ctx.api.call('doc.print', [ctx.doc().id], undefined, (err) =>
        ctx.store.getState().setCmdline({ cmdError: `print failed: ${String(err)}` })
      ),
  },
  {
    name: 'title',
    abbr: 'st',
    args: [{ kind: 'input' }],
    run: (ctx, [title]) => {
      ctx.store.getState().setDocMeta({ docTitle: title })
      return ctx.api.call('doc.setTitle', [ctx.doc().id, title])
    },
  },
  {
    name: 'project',
    abbr: 'sp',
    args: [{ kind: 'input' }],
    run: (ctx, [project]) => {
      ctx.store.getState().setDocMeta({ docProject: project })
      return ctx.api.call('doc.setProject', [ctx.doc().id, project])
    },
  },
  {
    name: 'move',
    abbr: 'mv',
    args: [{ kind: 'choice', values: (ctx) => ctx.api.call('project.list') }],
    run: (ctx, [dest]) => {
      ctx.store.getState().setDocMeta({ docProject: dest })
      return ctx.api.call('doc.move', [ctx.doc().id, dest])
    },
  },
  {
    name: 'git',
    abbr: 'gc',
    args: [{ kind: 'input', optional: true }],
    run: (ctx, [msg]) =>
      ctx.api.call(
        'git.commit',
        [ctx.doc().project, msg || '.'],
        (result) => ctx.store.getState().postLog({ type: 'git.commit', payload: result }),
        (err) => ctx.store.getState().setCmdline({ cmdError: `git commit failed: ${String(err)}` })
      ),
  },
  {
    name: 'note',
    abbr: 'n',
    args: [{ kind: 'input' }],
    run: (ctx, [text]) =>
      ctx.api.call('note.create', [ctx.doc().id, text], (note) =>
        ctx.store.getState().postLog({ type: 'note.create', payload: note })
      ),
  },
  {
    name: 'flush',
    abbr: 'fl',
    args: [],
    run: (ctx) => flushToDisk(ctx),
  },
  {
    name: 'view',
    abbr: 'v',
    args: [{ kind: 'choice', values: ['notes', 'logs'] }],
    run: async (ctx, [which]) => {
      if (which === 'notes') {
        ctx.store.getState().openOmni('notes')
        const notes = await ctx.api.call('note.list', [ctx.doc().id])
        ctx.store.getState().setOmniItems(notes)
      } else {
        ctx.store.getState().openOmni('logs')
        ctx.store.getState().setOmniItems(ctx.store.getState().logs)
      }
    },
  },
]

export function findByAbbr(abbr: string): CommandSpec | undefined {
  return commands.find((c) => c.abbr === abbr)
}
