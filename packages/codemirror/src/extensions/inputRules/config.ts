import type { InputRule, ResolvedWrap, WrapSpec } from './types'

export type InputRulesConfig = {
  /* physical character to logical character, applied before every other stage.
   * a swapped character is inserted literally: it never falls through to the rules
   * registered on its replacement, so shift+9 gives a bare `9` rather than the `9` pair */
  swaps?: Record<string, string>
  /* selection wrapping pairs; a '()' style string is shorthand for { pair: ['(', ')'] } */
  wraps?: (WrapSpec | string)[]
  /* context rules, first match wins */
  rules?: InputRule[]
  /* abbreviation rules, tried after `rules` */
  abbrevs?: InputRule[]
  /* extension precedence, defaults to 'high' */
  precedence?: 'high' | 'highest'
}

export type ResolvedConfig = {
  swaps: Record<string, string>
  /* logical character to the rules that trigger on it, in order */
  byChar: Map<string, InputRule[]>
  /* trigger character to its wrap spec */
  byTrigger: Map<string, ResolvedWrap>
}

function chars(on: string | string[]): string[] {
  return Array.isArray(on) ? on : [...on]
}

function resolveWrap(spec: WrapSpec | string): ResolvedWrap {
  const pair: [string, string] = typeof spec === 'string' ? [spec[0], spec.slice(1)] : spec.pair
  const base = typeof spec === 'string' ? {} : spec
  return {
    pair,
    triggers: base.triggers ?? [pair[0], pair[1]],
    block: base.block ?? 'auto',
  }
}

export function resolveConfig(config: InputRulesConfig): ResolvedConfig {
  const byChar = new Map<string, InputRule[]>()
  for (const rule of [...(config.rules ?? []), ...(config.abbrevs ?? [])]) {
    for (const char of chars(rule.on)) {
      const bucket = byChar.get(char)
      if (bucket) bucket.push(rule)
      else byChar.set(char, [rule])
    }
  }

  const byTrigger = new Map<string, ResolvedWrap>()
  for (const spec of config.wraps ?? []) {
    const wrap = resolveWrap(spec)
    for (const trigger of wrap.triggers) {
      if (!byTrigger.has(trigger)) byTrigger.set(trigger, wrap)
    }
  }

  return { swaps: config.swaps ?? {}, byChar, byTrigger }
}
