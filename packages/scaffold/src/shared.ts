// @paladin/scaffold/src/shared.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join, extname, basename, dirname } from "path"
import { homedir } from "os"
import { writeFileSafe } from "./utils"
import { TS_EXTS, PY_EXTS, SOURCE_EXCLUDED } from "./constants"
import type { Artifact } from "./parse"

// --- types ---

export type LangName = "typescript" | "python"

export interface ResolvedFile {
  path: string
  content: string
  lang: LangName | null
  /** ts package name, null for python and plain files */
  pkg: string | null
  /** ts package dir, null for python and plain files */
  pkgDir: string | null
}

export interface ScaffoldInput {
  org: string
  root: string
  files: ResolvedFile[]
}

// --- utils ---

export function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p
}

export function detectLang(filename: string): LangName | null {
  if (SOURCE_EXCLUDED.some(p => p.test(filename))) return null
  const ext = extname(filename)
  if (TS_EXTS.has(ext)) return "typescript"
  if (PY_EXTS.has(ext)) return "python"
  return null
}

export function extractHeader(content: string): string | null {
  const m = content.match(/^(?:\/\/|#)\s*(.+)\n/)
  if (!m) return null
  const raw = m[1].trim()
  if (!raw.includes("/") && !raw.includes(".")) return null
  return raw
}

export function stripHeader(content: string): string {
  return content.replace(/^(?:\/\/|#)\s*.+\n/, "")
}

export function deriveOrg(artifacts: Artifact[]): string {
  for (const a of artifacts) {
    const header = extractHeader(a.content)
    if (!header) continue
    const m = header.match(/^@([^/]+)\//)
    if (m) return m[1]
  }
  throw new Error("could not derive org from artifact paths — at least one must use @org/... format")
}

// --- shared operations ---

export async function filterUnchanged(files: ResolvedFile[]): Promise<ResolvedFile[]> {
  const kept: ResolvedFile[] = []
  for (const f of files) {
    if (!existsSync(f.path)) { kept.push(f); continue }
    const existing = await readFile(f.path, "utf-8")
    if (existing !== f.content) kept.push(f)
  }
  return kept
}

export async function writeFiles(files: ResolvedFile[]) {
  for (const f of files) {
    const isJson = extname(f.path) === ".json"
    await writeFileSafe(f.path, f.content, isJson ? { json: true } : undefined)
  }
}
