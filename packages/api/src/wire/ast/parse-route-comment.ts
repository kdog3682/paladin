const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const
type Method = (typeof METHODS)[number]

export function parseRouteComment(
  comments: any[] | undefined,
): { method: Method; path: string } | null {
  if (!comments?.length) return null
  for (const c of comments) {
    const raw = (c.value ?? "").trim()
    const m = raw.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\/\S*)/i)
    if (m) return { method: m[1].toUpperCase() as Method, path: m[2] }
  }
  return null
}
