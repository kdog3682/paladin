// src/utils/imports.ts

import { existsSync, statSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { basename, dirname, join } from "path"
import { init, parse } from "es-module-lexer"
import { config } from "../config"

// ── Types ───────────────────────────────────────────────────

export type ImportType = "dependency" | "devDependency" | "local"

export interface ImportEntry {
  type: ImportType
  name: string
}

interface CacheEntry {
  mtimeMs: number
  imports: ImportEntry[]
}

type CacheMap = Record<string, CacheEntry>

// ── State ───────────────────────────────────────────────────

let cache: CacheMap | null = null
let dirty = false
let cachePath: string | null = null
let currentRepo: string | null = null

// ── Helpers ─────────────────────────────────────────────────

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster",
  "console", "constants", "crypto", "dgram", "diagnostics_channel",
  "dns", "domain", "events", "fs", "http", "http2", "https",
  "inspector", "module", "net", "os", "path", "perf_hooks",
  "process", "punycode", "querystring", "readline", "repl",
  "stream", "string_decoder", "sys", "timers", "tls", "trace_events",
  "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
])

const BUN_BUILTINS = new Set([
  "bun", "bun:test", "bun:sqlite", "bun:ffi", "bun:jsc",
])

function isBuiltin(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true
  if (specifier.startsWith("bun:")) return true
  if (NODE_BUILTINS.has(specifier)) return true
  if (BUN_BUILTINS.has(specifier)) return true
  return false
}

export function extractPkgName(specifier: string): string {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/")
  }
  return specifier.split("/")[0]
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec|e2e)\./.test(basename(filePath))
}

function isLocal(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith('@/')
}

async function parseImports(filePath: string): Promise<ImportEntry[]> {
  await init

  const content = await readFile(filePath, "utf-8")
  const testFile = isTestFile(filePath)
  const imports: ImportEntry[] = []

  try {
    const [parsed] = parse(content)
    for (const imp of parsed) {
      if (!imp.n) continue

      if (isLocal(imp.n)) {
        imports.push({ type: "local", name: imp.n })
      } else if (!isBuiltin(imp.n)) {
        imports.push({
          type: testFile ? "devDependency" : "dependency",
          name: extractPkgName(imp.n),
        })
      }
    }
  } catch {
    // skip unparseable files
  }

  return imports
}

// ── Cache Management ────────────────────────────────────────

export async function loadImportCache(repoName: string): Promise<void> {
  if (cache && currentRepo === repoName) return

  cachePath = join(config.fileCacheBase, repoName, "import-cache.json")
  currentRepo = repoName

  if (existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf-8")
    cache = JSON.parse(raw)
  } else {
    cache = {}
  }

  dirty = false
}

export function pruneDeleted(): void {
  if (!cache) return

  for (const filePath of Object.keys(cache)) {
    if (!existsSync(filePath)) {
      delete cache[filePath]
      dirty = true
    }
  }
}

export async function flushImportCache(): Promise<void> {
  if (!dirty || !cache || !cachePath) return

  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(cache, null, 2))
  dirty = false
}

// ── Public ──────────────────────────────────────────────────

export async function getImports(filePath: string): Promise<ImportEntry[]> {
  if (!cache) {
    throw new Error("import cache not loaded — call loadImportCache first")
  }

  // check cache
  const entry = cache[filePath]
  if (entry && existsSync(filePath)) {
    const stat = statSync(filePath)
    if (stat.mtimeMs === entry.mtimeMs) {
      return entry.imports
    }
  }

  // parse and cache
  const imports = await parseImports(filePath)
  const stat = statSync(filePath)

  cache[filePath] = { mtimeMs: stat.mtimeMs, imports }
  dirty = true

  return imports
}