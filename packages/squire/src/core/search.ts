// @paladin/squire/src/core/search.ts

import type { VersionInfo } from "./version"

export function findByQuery(entries: VersionInfo[], query: string): VersionInfo | null {
  const lower = query.toLowerCase()
  const match = entries.find(e => e.message?.toLowerCase().includes(lower))
  return match ?? null
}

export function findLatestForPkg(entries: VersionInfo[]): VersionInfo | null {
  if (entries.length === 0) return null
  return entries.reduce((a, b) => (a.version >= b.version ? a : b))
}
