const BOUNDARY = "/._-"

/* subsequence match. rewards consecutive runs and word boundaries, lightly penalises length. null = no match */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let from = 0
  let last = -2
  let streak = 0
  let score = 0
  for (const ch of q) {
    if (ch === " ") continue
    const i = t.indexOf(ch, from)
    if (i < 0) return null
    streak = i === last + 1 ? streak + 1 : 0
    const boundary = i === 0 || BOUNDARY.includes(t[i - 1]) || (text[i] !== t[i] && text[i - 1] === t[i - 1])
    score += 1 + streak * 2 + (boundary ? 3 : 0)
    last = i
    from = i + 1
  }
  return score - t.length * 0.01
}

export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string, limit = 100): T[] {
  if (!query.trim()) return items.slice(0, limit)
  const scored: { item: T, score: number }[] = []
  for (const item of items) {
    const score = fuzzyScore(query, getText(item))
    if (score !== null) scored.push({ item, score })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item)
}
