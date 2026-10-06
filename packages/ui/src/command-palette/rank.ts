import type { PaletteCommand } from "./types"

const BOUNDARY = new Set([" ", "-", "_", "/", ".", ":", "@"])

function isBoundary(text: string, index: number) {
  return index === 0 || BOUNDARY.has(text[index - 1])
}

/*
 * fuzzy score of query against target. 0 means no match, higher is better.
 * substring matches always outrank subsequence matches.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const t = target.toLowerCase()

  const at = t.indexOf(q)
  if (at !== -1) {
    let score = 10_000 - at
    if (at === 0) score += 500
    else if (isBoundary(t, at)) score += 250
    if (t.length === q.length) score += 500
    return score
  }

  let score = 0
  let from = 0
  let prev = -2
  for (const ch of q) {
    if (ch === " ") continue
    const found = t.indexOf(ch, from)
    if (found === -1) return 0
    score += 10
    if (found === prev + 1) score += 15
    if (isBoundary(t, found)) score += 20
    score -= Math.min(found - from, 10)
    prev = found
    from = found + 1
  }
  return Math.max(score, 1)
}

/* best score over a command's title and keywords */
export function scoreCommand<Ctx, R>(query: string, command: PaletteCommand<Ctx, R>): number {
  let best = fuzzyScore(query, command.title)
  command.keywords.forEach((keyword, i) => {
    const score = fuzzyScore(query, keyword) * (i === 0 ? 1 : 0.9)
    if (score > best) best = score
  })
  return best
}

/* filters by when(ctx) and sorts by score; an empty query keeps registration order */
export function rankCommands<Ctx, R>(
  query: string,
  commands: PaletteCommand<Ctx, R>[],
  ctx: Ctx,
): PaletteCommand<Ctx, R>[] {
  const visible = commands.filter((c) => !c.when || c.when(ctx))
  if (!query.trim()) return visible
  return visible
    .map((command) => ({ command, score: scoreCommand(query, command) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.command)
}

export type Scored<T> = {
  item: T
  score: number
}

/* generic fuzzy filter for providers; an empty query keeps every item in order */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  text: (item: T) => string | string[],
): Scored<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 1 }))
  return items
    .map((item) => {
      const texts = text(item)
      const list = Array.isArray(texts) ? texts : [texts]
      return { item, score: Math.max(0, ...list.map((t) => fuzzyScore(query, t))) }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
}
