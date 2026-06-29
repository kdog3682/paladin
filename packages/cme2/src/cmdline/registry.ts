import type { CommandSpec, Ctx, ArgSpec } from '../features/types'

export class CommandRegistry {
  private byKey = new Map<string, CommandSpec>()
  private byAbbr = new Map<string, CommandSpec>()

  constructor(specs: CommandSpec[]) {
    for (const s of specs) {
      this.byKey.set(s.key, s)
      if (s.abbr) this.byAbbr.set(s.abbr, s)
    }
  }

  list(): CommandSpec[] {
    return [...this.byKey.values()]
  }

  // longest key match wins so 'git commit' beats 'git'.
  resolve(line: string): { spec: CommandSpec; rest: string } | null {
    const keys = [...this.byKey.keys()].sort((a, b) => b.length - a.length)
    for (const k of keys) {
      if (line === k || line.startsWith(k + ' ')) {
        return { spec: this.byKey.get(k)!, rest: line.slice(k.length).trim() }
      }
    }
    const token = line.split(/\s+/)[0]
    const byAbbr = this.byAbbr.get(token)
    if (byAbbr) return { spec: byAbbr, rest: line.slice(token.length).trim() }
    return null
  }

  // split rest into positional args; a freeform arg eats the remainder.
  private split(spec: CommandSpec, rest: string): string[] {
    const args = spec.args ?? []
    const out: string[] = []
    let cursor = rest
    for (let i = 0; i < args.length; i++) {
      if (args[i].freeform) {
        out.push(cursor.trim())
        return out
      }
      const m = cursor.match(/^\S+/)
      if (!m) break
      out.push(m[0])
      cursor = cursor.slice(m[0].length).trim()
    }
    return out
  }

  // completion source for the current arg slot.
  async complete(line: string, ctx: Ctx): Promise<string[]> {
    const r = this.resolve(line)
    if (!r) {
      const partial = line.trim()
      return this.list()
        .map((s) => s.key)
        .filter((k) => k.startsWith(partial))
    }
    const filled = this.split(r.spec, r.rest)
    const idx = line.endsWith(' ') ? filled.length : Math.max(0, filled.length - 1)
    const arg: ArgSpec | undefined = r.spec.args?.[idx]
    if (!arg?.options) return []
    const opts = typeof arg.options === 'function' ? await arg.options(ctx, filled[idx] ?? '') : arg.options
    return opts.filter((o) => o.startsWith(filled[idx] ?? ''))
  }

  async exec(line: string, ctx: Ctx): Promise<unknown> {
    const r = this.resolve(line)
    if (!r) throw new Error(`unknown command: ${line}`)
    const provided = this.split(r.spec, r.rest)
    const args: unknown[] = []
    const specs = r.spec.args ?? []
    for (let i = 0; i < specs.length; i++) {
      if (provided[i] !== undefined && provided[i] !== '') args.push(provided[i])
      else if (specs[i].optional && specs[i].fallback) args.push(await specs[i].fallback!(ctx))
      else if (specs[i].optional) args.push(undefined)
      else throw new Error(`missing arg: ${specs[i].name ?? i}`)
    }
    return r.spec.run(ctx, ...args)
  }
}
