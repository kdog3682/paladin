// @paladin/squire/src/core/version.ts

export type VersionInfo = {
  pkg: string
  version: number
  message?: string
  hash?: string
}

const WIP_PATTERN = /^wip\(([^)]+)\):\s*v(\d+)(?:\s*--\s*(.+))?$/

export function parseWipMessage(raw: string): VersionInfo | null {
  const match = raw.match(WIP_PATTERN)
  if (!match) return null
  return {
    pkg: match[1],
    version: parseInt(match[2], 10),
    message: match[3]?.trim(),
  }
}

export function latestVersion(entries: VersionInfo[]): number {
  if (entries.length === 0) return 0
  return Math.max(...entries.map(e => e.version))
}

export function buildCommitMessage(pkg: string, version: number, message?: string): string {
  const base = `wip(${pkg}): v${version}`
  if (!message) return base
  return `${base} -- ${message}`
}

export function nextCommitMessage(history: VersionInfo[], pkg: string, message?: string): string {
  const pkgEntries = history.filter(e => e.pkg === pkg)
  const next = latestVersion(pkgEntries) + 1
  return buildCommitMessage(pkg, next, message)
}
