import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative } from "node:path"
import { dump, load } from "js-yaml"
import { commonRoot } from "../path/commonRoot"
import { resolveScopedPath } from "../path/resolveScopedPath"

export type FileEntry = { path: string; content: string }
export type FileMap = Map<string, string>
export type FileInput = Record<string, string> | FileMap | FileEntry[] | string[]
export type Vars = Record<string, string | number | boolean>
export type Meta = Record<string, unknown>

export type Bundle = {
  yaml: Meta
  root: string
  files: FileEntry[]
}

const HEADER = /^\/\*\*[ \t]+(.+?)[ \t]+\*\*\/[ \t]*$/
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g

export class MissingVarError extends Error {
  constructor(public key: string) {
    super(`bundle: no value for {{${key}}} and no fallback provided`)
    this.name = "MissingVarError"
  }
}

/**
 * Substitutes `{{KEY}}` and `{{KEY | fallback}}` placeholders. With no `vars`
 * the text is returned untouched, which is how a template stays a template.
 */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(PLACEHOLDER, (_match, key: string, fallback?: string) => {
    const value = vars[key]
    if (value !== undefined) return String(value)
    if (fallback !== undefined) return fallback
    throw new MissingVarError(key)
  })
}

/**
 * Normalizes any accepted file input into entries, reading from disk for
 * filepaths. Paths are kept exactly as given; `bundle` strips the shared root.
 */
export function toEntries(files: FileInput): FileEntry[] {
  if (files instanceof Map) {
    return [...files].map(([path, content]) => ({ path, content }))
  }
  if (!Array.isArray(files)) {
    return Object.entries(files).map(([path, content]) => ({ path, content }))
  }
  return files.map(file => {
    if (typeof file !== "string") return { path: file.path, content: file.content }
    return { path: file, content: readFileSync(file, "utf8") }
  })
}

/**
 * Serializes files into a single bundle string, optionally prefixed with a YAML
 * preamble. Accepts a path-to-content record or Map, entry objects, or
 * filepaths to read. The directory shared by every path is stripped from the
 * entries and recorded as `root` in the preamble; pass `meta.root` to override.
 */
export function bundle(files: FileInput, vars?: Vars, meta?: Meta): string {
  const entries = toEntries(files).map(entry => ({
    path: fill(entry.path, vars).trim(),
    content: fill(entry.content, vars).replace(/\s+$/, ""),
  }))

  const given = typeof meta?.root === "string" ? meta.root : undefined
  const root = given ?? commonRoot(entries.map(entry => entry.path))

  const yaml: Meta = { ...meta }
  if (root !== "") yaml.root = root

  const chunks: string[] = []
  if (Object.keys(yaml).length > 0) {
    chunks.push(`/*\n${dump(yaml).trimEnd()}\n*/`)
  }

  for (const entry of entries) {
    chunks.push(`/** ${strip(entry.path, root)} **/\n${entry.content}`)
  }

  return chunks.join("\n\n") + "\n"
}

/**
 * Parses a bundle back into its YAML preamble and file entries. Takes either the
 * bundle text or a path to a file holding it. Entry paths stay relative to
 * `root`; join them yourself to land files back where they came from.
 */
export function bundleToFiles(input: string, vars?: Vars): Bundle {
  const text = read(input)
  const lines = text.split("\n")

  const { yaml, start } = preamble(lines)
  const root = typeof yaml.root === "string" ? yaml.root : ""

  const files: FileEntry[] = []
  let path: string | null = null
  let buffer: string[] = []

  const flush = () => {
    if (path === null) return
    const content = buffer.join("\n").replace(/^\n+/, "").replace(/\s+$/, "")
    files.push({ path, content: content === "" ? "" : content + "\n" })
  }

  for (let i = start; i < lines.length; i++) {
    const match = lines[i].match(HEADER)
    if (match) {
      flush()
      path = match[1].trim()
      buffer = []
      continue
    }
    if (path !== null) buffer.push(lines[i])
  }
  flush()

  if (!vars) return { yaml, root, files }

  return {
    yaml,
    root,
    files: files.map(file => ({
      path: fill(file.path, vars),
      content: fill(file.content, vars),
    })),
  }
}

function strip(path: string, root: string): string {
  if (root === "") return path
  if (isAbsolute(path) !== isAbsolute(root)) return path
  const rel = relative(root, path)
  if (rel === "" || rel.startsWith("..")) return path
  return rel
}

function read(input: string): string {
  const isPath = !input.includes("\n") && !input.includes("/**") && input.length < 4096
  if (isPath && existsSync(input)) return readFileSync(input, "utf8")
  return input
}

function preamble(lines: string[]): { yaml: Meta; start: number } {
  let i = 0
  while (i < lines.length && lines[i].trim() === "") i++
  if (lines[i]?.trim() !== "/*") return { yaml: {}, start: 0 }

  const body: string[] = []
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === "*/") {
      const parsed = load(body.join("\n"))
      const yaml = parsed && typeof parsed === "object" ? (parsed as Meta) : {}
      return { yaml, start: j + 1 }
    }
    if (HEADER.test(lines[j])) break
    body.push(lines[j])
  }

  return { yaml: {}, start: 0 }
}
