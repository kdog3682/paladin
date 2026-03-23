// @paladin/scaffold-v2/get-imports.ts

import { TS_IMPORT_RE, NODE_BUILTINS } from "./constants"
import type { ImportTable } from "./types"

function isIgnored(spec: string): boolean {
  if (spec.startsWith("@/") || spec.startsWith(".") || spec.startsWith("node:") || spec.startsWith("bun:")) return true
  const bare = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
  return NODE_BUILTINS.has(bare)
}

export function getImports(content: string, projectName: string): ImportTable {
  const ws = new Set<string>()
  const ext = new Set<string>()
  const prefix = `@${projectName}/`

  for (const [, spec] of content.matchAll(TS_IMPORT_RE)) {
    if (isIgnored(spec)) continue
    const parts = spec.split("/")
    const pkg = spec.startsWith("@") && parts.length >= 2
      ? `${parts[0]}/${parts[1]}`
      : parts[0]
    if (pkg.startsWith(prefix)) ws.add(pkg)
    else ext.add(pkg)
  }

  return { workspace: [...ws], external: [...ext] }
}

export function hasImport(table: ImportTable, name: string): boolean {
  return table.external.includes(name) || table.workspace.includes(name)
}
