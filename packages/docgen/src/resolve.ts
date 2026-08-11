import { statSync } from "node:fs"
import { dirname, join, resolve as resolvePath } from "node:path"
import { parse } from "./parse"
import type { ExportedSymbol, Store } from "./docgen.types"
import type { FileDoc } from "./parse.types"

export const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx"]

export function createStore(extensions: string[] = DEFAULT_EXTENSIONS): Store {
  return {
    docs: new Map(),
    exportCache: new Map(),
    visiting: new Set(),
    unresolved: new Set(),
    failed: new Map(),
    extensions,
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve a relative specifier to a file on disk. Bare specifiers return null:
 * we only document what lives in the tree we were pointed at.
 */
export function resolveSpecifier(
  from: string,
  spec: string,
  extensions: string[] = DEFAULT_EXTENSIONS,
): string | null {
  if (!spec.startsWith(".")) return null
  const base = resolvePath(dirname(from), spec)
  const stripped = base.replace(/\.(js|mjs|cjs|jsx)$/, "")
  const candidates = [
    base,
    ...extensions.map((ext) => `${stripped}${ext}`),
    ...extensions.map((ext) => join(stripped, `index${ext}`)),
  ]
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate
  }
  return null
}

function isThenable(value: unknown): boolean {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function"
}

/** Tolerate a parser that omits empty collections. */
function normalize(doc: FileDoc): FileDoc {
  return {
    ...doc,
    imports: doc.imports ?? [],
    reExports: doc.reExports ?? [],
    symbols: doc.symbols ?? [],
  }
}

function accept(store: Store, abs: string, doc: unknown): FileDoc | null {
  if (!doc || typeof doc !== "object") {
    store.failed.set(abs, "parse returned no document")
    return null
  }
  const candidate = doc as FileDoc
  if (!Array.isArray(candidate.symbols)) {
    store.failed.set(abs, "parse returned a document without a `symbols` array")
    return null
  }
  const normalized = normalize(candidate)
  store.docs.set(abs, normalized)
  return normalized
}

/**
 * Parse a file once and memoise it. Parse failures are recorded, not thrown.
 *
 * This is the synchronous path used by the export walk. When `parse` is async,
 * every file must already be in the cache via `prime`.
 */
export function load(store: Store, file: string): FileDoc | null {
  const abs = resolvePath(file)
  const cached = store.docs.get(abs)
  if (cached) return cached
  if (store.failed.has(abs)) return null
  if (!isFile(abs)) return null
  try {
    const doc: unknown = parse(abs)
    if (isThenable(doc)) {
      store.failed.set(abs, "`parse` is async — call `prime(store, files)` before walking exports")
      return null
    }
    return accept(store, abs, doc)
  } catch (error) {
    store.failed.set(abs, error instanceof Error ? error.message : String(error))
    return null
  }
}

async function loadAsync(store: Store, file: string): Promise<FileDoc | null> {
  const abs = resolvePath(file)
  const cached = store.docs.get(abs)
  if (cached) return cached
  if (store.failed.has(abs)) return null
  if (!isFile(abs)) return null
  try {
    return accept(store, abs, await parse(abs))
  } catch (error) {
    store.failed.set(abs, error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * Fill the parse cache by walking imports and re-exports out from `files`,
 * so the synchronous export and type-reference passes only ever hit cache.
 * Awaiting a synchronous `parse` costs nothing, so this is always safe to call.
 */
export async function prime(store: Store, files: string[]): Promise<void> {
  const queue = files.map((file) => resolvePath(file))
  const seen = new Set<string>()
  let cursor = 0

  while (cursor < queue.length) {
    const file = queue[cursor]
    cursor += 1
    if (!file || seen.has(file)) continue
    seen.add(file)

    const doc = await loadAsync(store, file)
    if (!doc) continue

    const specifiers = [
      ...doc.imports.map((entry) => entry.source),
      ...doc.reExports.map((entry) => entry.source),
    ]
    for (const specifier of specifiers) {
      const target = resolveSpecifier(file, specifier, store.extensions)
      if (target) queue.push(target)
    }
  }
}

/**
 * Public surface of a module, keyed by exposed name. Re-exports are followed to
 * the declaring file so an index barrel never becomes the owner of a symbol.
 */
export function exportsOf(store: Store, file: string): Map<string, ExportedSymbol> {
  const abs = resolvePath(file)
  const cached = store.exportCache.get(abs)
  if (cached) return cached
  if (store.visiting.has(abs)) return new Map()

  store.visiting.add(abs)
  const out = new Map<string, ExportedSymbol>()
  const doc = load(store, abs)

  if (doc) {
    for (const symbol of doc.symbols) {
      if (symbol.exportKind === "none") continue
      const exposedAs = symbol.exportedAs ?? symbol.name
      out.set(exposedAs, { file: abs, symbol, exposedAs })
    }

    for (const re of doc.reExports) {
      const target = resolveSpecifier(abs, re.source, store.extensions)
      if (!target) {
        store.unresolved.add(re.source)
        continue
      }
      const inner = exportsOf(store, target)

      if (re.namespace) {
        for (const [name, hit] of inner) {
          if (name === "default") continue
          const key = `${re.namespace}.${name}`
          if (!out.has(key)) out.set(key, { ...hit, exposedAs: key })
        }
        continue
      }

      if (re.star) {
        for (const [name, hit] of inner) {
          // `export *` never forwards a default, and local declarations win.
          if (name === "default" || out.has(name)) continue
          out.set(name, hit)
        }
        continue
      }

      for (const binding of re.bindings) {
        const hit = inner.get(binding.name)
        if (!hit || out.has(binding.exported)) continue
        out.set(binding.exported, { ...hit, exposedAs: binding.exported })
      }
    }
  }

  store.visiting.delete(abs)
  store.exportCache.set(abs, out)
  return out
}
