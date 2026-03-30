// @paladin/scaffold-v2/scaffold/get-imports.ts

import { TS_IMPORT_RE, NODE_BUILTINS } from "../constants"
import type { ImportEntry } from "./types"

function isIgnored(spec: string): boolean {
  if (spec.startsWith("@/") || spec.startsWith(".") || spec.startsWith("node:") || spec.startsWith("bun:")) return true
  const bare = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
  return NODE_BUILTINS.has(bare)
}

/**
 * parse import/export statements into a flat list of ImportEntry.
 *
 * workspace imports: `@<projectName>/foo` or `@<projectName>/foo/bar/baz`
 * external imports: everything else that isn't ignored
 *
 * subpath is the portion after the package name, e.g.
 * `@acme/foobar/abcde/asdf` → package `@acme/foobar`, subpath `abcde/asdf`
 */
export function getImports(content: string, projectName: string): ImportEntry[] {
  const seen = new Set<string>()
  const entries: ImportEntry[] = []
  const prefix = `@${projectName}/`

  for (const [, spec] of content.matchAll(TS_IMPORT_RE)) {
    if (isIgnored(spec)) continue
    if (seen.has(spec)) continue
    seen.add(spec)

    const parts = spec.split("/")
    const isScoped = spec.startsWith("@")

    const pkg = isScoped && parts.length >= 2
      ? `${parts[0]}/${parts[1]}`
      : parts[0]

    const remainingParts = isScoped ? parts.slice(2) : parts.slice(1)
    const subpath = remainingParts.length > 0 ? remainingParts.join("/") : null

    const kind = pkg.startsWith(prefix) ? "workspace" : "external"

    entries.push({ specifier: spec, package: pkg, subpath, kind })
  }

  return entries
}

export function hasImport(entries: ImportEntry[], name: string): boolean {
  return entries.some(e => e.package === name)
}
