// @paladin/scaffold/src/parse.ts

import { homedir } from "os"
import { join, extname, basename } from "path"

export interface Artifact {
  content: string
  id: string
}

export interface ParsedFile {
  path: string
  content: string
  pkg: string | null
  org: string | null
}

export interface ParseOptions {
  baseProjectDir?: string
  workspaceFolders?: string[]
  defaultWorkspaceFolder?: string
}

export interface ParseResult {
  files: ParsedFile[]
  org: string
  root: string
  pkgDirs: Record<string, string>
}

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"])
const NON_SOURCE_PATTERNS = [/\.config\.\w+$/, /\.d\.ts$/]

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p
}

function isSourceFile(filename: string): boolean {
  if (NON_SOURCE_PATTERNS.some(p => p.test(filename))) return false
  return SOURCE_EXTS.has(extname(filename))
}

function extractHeader(content: string): { path: string | null, cleaned: string } {
  const match = content.match(/^\/\/\s*(.+)\s*\n/)
  if (!match) return { path: null, cleaned: content }
  const raw = match[1].trim()
  if (!raw.includes("/") && !raw.includes(".")) return { path: null, cleaned: content }
  return { path: raw, cleaned: content }
}

function stripHeader(content: string): string {
  return content.replace(/^\/\/\s*.+\n/, "")
}

export function parse(
  artifacts: Artifact[],
  options: Required<ParseOptions>
): ParseResult {
  const base = options.baseProjectDir
  const workspaceFolders = options.workspaceFolders
  const defaultWs = options.defaultWorkspaceFolder

  const headers = artifacts.map(a => {
    const { path, cleaned } = extractHeader(a.content)
    return { path, content: cleaned, id: a.id }
  })

  // derive org from the first @org/... path
  let org: string | null = null
  for (const h of headers) {
    if (!h.path) continue
    const m = h.path.match(/^@([^/]+)\//)
    if (m) { org = m[1]; break }
  }

  if (!org) throw new Error("could not derive org from artifact paths — at least one must use @org/... format")

  const root = join(base, org)
  const prefix = `@${org}/`
  const pkgDirs: Record<string, string> = {}

  const files: ParsedFile[] = headers.map(h => {
    if (!h.path) throw new Error(`artifact ${h.id} has no path comment`)

    const raw = h.path

    // absolute or home-relative — pass through as-is
    if (raw.startsWith("~/") || raw.startsWith("/")) {
      const abs = expandHome(raw)
      const isJson = extname(abs) === ".json"
      return { path: abs, content: isJson ? stripHeader(h.content) : h.content, pkg: null, org: null }
    }

    // relative to project root
    if (raw.startsWith("./")) {
      const abs = join(root, raw.slice(2))
      const isJson = extname(abs) === ".json"
      return { path: abs, content: isJson ? stripHeader(h.content) : h.content, pkg: null, org: null }
    }

    // @org/... path — resolve workspace folder, package dir, and /src/ injection
    const withoutOrg = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw
    const parts = withoutOrg.split("/")
    const pkgName = parts[0]
    const rest = parts.slice(1).join("/")
    const filename = basename(rest || pkgName)

    let pkgDir: string
    let filePath: string
    if (workspaceFolders.includes(parts[0])) {
      // explicit workspace folder: @acme/packages/foobar/src/abc.ts
      pkgDir = join(root, parts[0], parts[1])
      filePath = parts.slice(2).join("/")
    } else {
      // shorthand: @acme/foobar/abc.ts — inject default workspace folder
      pkgDir = join(root, defaultWs, pkgName)
      filePath = rest
    }

    if (!filePath) filePath = filename

    // source files get /src/ injected if not already present
    if (isSourceFile(filename) && !filePath.includes("src/") && !filePath.startsWith("src/")) {
      filePath = `src/${filePath}`
    }

    if (!pkgDirs[pkgName]) pkgDirs[pkgName] = pkgDir

    const abs = join(pkgDir, filePath)
    const isJson = extname(abs) === ".json"

    return {
      path: abs,
      content: isJson ? stripHeader(h.content) : h.content,
      pkg: pkgName,
      org,
    }
  })

  return { files, org, root, pkgDirs }
}
