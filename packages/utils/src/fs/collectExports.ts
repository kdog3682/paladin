import { readFileSync } from "node:fs"
import { dirname } from "node:path"
import { resolveRelativeImport } from "../path/resolveRelativeImport"

export type ExportTarget = {
  /** Absolute path of the declaring file. */
  file: string
  /** Declaration name inside that file. */
  local: string
}

/** Exported name -> where it is declared. */
export type ExportMap = Map<string, ExportTarget>

const NAMED_REEXPORT = /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g
const LOCAL_LIST = /export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from\b)/g
const STAR_REEXPORT = /export\s+\*\s+from\s*["']([^"']+)["']/g
const LOCAL_DECL = /^[ \t]*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:class|const\s+enum|enum|const|let|var|type|interface|namespace)\s+)([A-Za-z_$][\w$]*)/gm

const memo = new Map<string, ExportMap>()

/**
 * Follow a module's exports (named + star re-exports, local declarations and
 * local export lists) to the files that declare them. Circular re-exports are
 * tolerated. Only relative specifiers are followed. Results are cached per file
 * for the life of the process.
 */
export function collectExports(file: string): ExportMap {
  return walk(file, new Set())
}

function walk(file: string, stack: Set<string>): ExportMap {
  const cached = memo.get(file)
  if (cached) return cached
  const out: ExportMap = new Map()
  if (stack.has(file)) return out
  stack.add(file)
  const text = readFileSync(file, "utf8")
  const dir = dirname(file)

  for (const match of text.matchAll(NAMED_REEXPORT)) {
    const target = resolveRelativeImport(dir, match[2])
    if (!target) continue
    const inner = walk(target, stack)
    for (const spec of parseSpecifiers(match[1])) {
      if (out.has(spec.exported)) continue
      out.set(spec.exported, inner.get(spec.imported) ?? { file: target, local: spec.imported })
    }
  }

  for (const match of text.matchAll(LOCAL_LIST)) {
    for (const spec of parseSpecifiers(match[1])) {
      if (!out.has(spec.exported)) out.set(spec.exported, { file, local: spec.imported })
    }
  }

  for (const match of text.matchAll(LOCAL_DECL)) {
    const name = match[1]
    if (!out.has(name)) out.set(name, { file, local: name })
  }

  // star re-exports last: explicit exports shadow them
  for (const match of text.matchAll(STAR_REEXPORT)) {
    const target = resolveRelativeImport(dir, match[1])
    if (!target) continue
    for (const [name, value] of walk(target, stack)) {
      if (name !== "default" && !out.has(name)) out.set(name, value)
    }
  }

  stack.delete(file)
  memo.set(file, out)
  return out
}

function parseSpecifiers(list: string): { imported: string, exported: string }[] {
  const specs: { imported: string, exported: string }[] = []
  for (const item of list.split(",")) {
    const clean = item.trim().replace(/^type\s+/, "")
    if (!clean) continue
    const [imported, exported] = clean.split(/\s+as\s+/)
    specs.push({ imported, exported: exported ?? imported })
  }
  return specs
}
