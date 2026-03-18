// @paladin/project-viewer-backend/src/lib/grep.ts
import { $ } from "bun"
import { exists } from "node:fs/promises"
import { join } from "node:path"

export type GrepResult = {
  pattern: string
  matches: string[]
  effective: boolean
}

export async function grep(
  root: string,
  pattern: string,
  paths: string[],
): Promise<GrepResult> {
  const matched: Set<string> = new Set()

  for (const p of paths) {
    const full = join(root, p)
    const ok = await exists(full)
    if (!ok) continue

    const result = await $`grep -l -r ${pattern} ${full}`.quiet().nothrow()
    const out = result.stdout.toString().trim()
    if (!out) continue

    for (const line of out.split("\n")) {
      const rel = line.replace(root + "/", "")
      matched.add(rel)
    }
  }

  return {
    pattern,
    matches: [...matched],
    effective: matched.size > 0,
  }
}

export function applyGreps(
  paths: string[],
  greps: GrepResult[],
): { filtered: string[], ineffective: string[] } {
  if (greps.length === 0) return { filtered: paths, ineffective: [] }

  const included = new Set<string>()
  const ineffective: string[] = []

  for (const g of greps) {
    if (!g.effective) {
      ineffective.push(g.pattern)
      continue
    }
    for (const m of g.matches) included.add(m)
  }

  const filtered = paths.filter(p => included.has(p))
  return { filtered, ineffective }
}
