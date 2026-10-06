const UNITS: [string, number][] = [
  ["y", 365 * 24 * 3600_000],
  ["mo", 30 * 24 * 3600_000],
  ["d", 24 * 3600_000],
  ["h", 3600_000],
  ["m", 60_000],
]

/* "3d ago", "just now" */
export function timeAgo(epochMs: number, now = Date.now()) {
  const diff = Math.max(0, now - epochMs)
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return `${Math.floor(diff / ms)}${unit} ago`
  }
  return "just now"
}

export function basename(path: string) {
  const trimmed = path.replace(/\/+$/, "")
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed
}
