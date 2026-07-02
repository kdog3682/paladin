import type { AppContext } from './commands'

export type ArgSpec =
  | {
      kind: 'choice'
      values: readonly string[] | ((ctx: AppContext) => Promise<readonly string[]> | readonly string[])
    }
  | { kind: 'input'; optional?: boolean }

export interface CommandSpec {
  name: string
  abbr: string
  args: readonly ArgSpec[]
  run(ctx: AppContext, args: readonly string[]): void | Promise<void>
}

// ---------- scratchpad naming ----------

function timeBin(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

function weekday(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
}

export function defaultScratchpadName(d = new Date()): string {
  return `${weekday(d)}-${timeBin(d)}`
}

const DATED_TITLE_RE = /^[a-z]+-(morning|afternoon|evening)$/

export function isUnnamedScratchpad(project: string, title: string): boolean {
  return project === 'scratchpad' && DATED_TITLE_RE.test(title)
}

// ---------- command registry ----------

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
      ctx.api.call('doc.print', [ctx.doc().id], {
        onError: (err) => ctx.store.getState().setCmdline({ cmdError: `print failed: ${String(err)}` }),
      }),
  },
  {
    name: 'set title',
    abbr: 'st',
    args: [{ kind: 'input' }],
    run: (ctx, [title]) => {
      ctx.store.getState().setDocMeta({ docTitle: title })
      return ctx.api.call('doc.setTitle', [ctx.doc().id, title])
    },
  },
  {
    name: 'set project',
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
    run: (ctx, [dest]) => ctx.api.call('doc.move', [ctx.doc().id, dest]),
  },
  {
    name: 'git',
    abbr: 'gc',
    args: [{ kind: 'input', optional: true }],
    run: (ctx, [msg]) => ctx.api.call('git.commit', [msg ?? '']),
  },
]

export function findByAbbr(abbr: string): CommandSpec | undefined {
  return commands.find((c) => c.abbr === abbr)
}
