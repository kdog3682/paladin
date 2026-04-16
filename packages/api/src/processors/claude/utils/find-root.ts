// src/processors/claude/utils/find-root.ts

import path from "node:path"

/**
 * Given an absolute file path inside a monorepo structure like
 * `${base}/org/packages/pkg/...`, return `${base}/org` (the project root).
 *
 * Falls back to walking up 4 levels if the path doesn't contain `packages` or `apps`.
 */
export function findProjectRoot(filePath: string, baseProjectsDir: string): { dir: string, name: string } | null {
  const base = baseProjectsDir.replace(/\/$/, "")
  if (!filePath.startsWith(base)) return null

  const rel = filePath.slice(base.length + 1)
  const parts = rel.split(path.sep)
  const org = parts[0]
  if (!org) return null

  return { dir: path.join(base, org), name: org }
}
