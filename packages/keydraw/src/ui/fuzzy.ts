/* subsequence match score (lower is better), or null when `query` is not a subsequence of `text` */
export function fuzzy(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  let ti = 0
  let score = 0
  let last = -1
  for (const ch of q) {
    const at = t.indexOf(ch, ti)
    if (at < 0) return null
    // gaps cost; a match at a word start is cheaper
    score += last < 0 ? at : at - last - 1
    if (at > 0 && /[a-z0-9]/.test(t[at - 1])) score += 0.5
    last = at
    ti = at + 1
  }
  return score + t.length * 0.01
}

export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  return items
    .map(item => ({ item, score: fuzzy(query, text(item)) }))
    .filter((x): x is { item: T, score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score)
    .map(x => x.item)
}
