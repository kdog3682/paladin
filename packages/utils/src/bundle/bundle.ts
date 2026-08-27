import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import { dump, load } from "js-yaml"

export type FileEntry = { path: string; content: string }
export type FileInput = Record<string, string> | FileEntry[] | string[]
export type Vars = Record<string, string | number | boolean>
export type Meta = Record<string, unknown>

export type Bundle = {
  yaml: Meta
  files: FileEntry[]
}

export type CreateProjectOpts = {
  root?: string
  vars?: Vars
  overwrite?: boolean
  installNodeModules?: boolean
}

export type CreateProjectResult = {
  root: string
  yaml: Meta
  files: string[]
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
 * filepaths. Stored paths are relative to `root`, defaulting to the cwd.
 */
export function toEntries(files: FileInput, root?: string): FileEntry[] {
  if (!Array.isArray(files)) {
    return Object.entries(files).map(([path, content]) => ({ path, content }))
  }
  const base = root ?? process.cwd()
  return files.map(file => {
    if (typeof file !== "string") return { path: file.path, content: file.content }
    return { path: relative(base, resolve(file)), content: readFileSync(file, "utf8") }
  })
}

/**
 * Serializes files into a single bundle string, optionally prefixed with a YAML
 * preamble. Accepts a path-to-content record, entry objects, or filepaths to read.
 */
export function pack(files: FileInput, vars?: Vars, meta?: Meta): string {
  const chunks: string[] = []
  const root = typeof meta?.root === "string" ? meta.root : undefined

  if (meta && Object.keys(meta).length > 0) {
    chunks.push(`/*\n${dump(meta).trimEnd()}\n*/`)
  }

  for (const entry of toEntries(files, root)) {
    const path = fill(entry.path, vars).trim()
    const content = fill(entry.content, vars).replace(/\s+$/, "")
    chunks.push(`/** ${path} **/\n${content}`)
  }

  return chunks.join("\n\n") + "\n"
}

/**
 * Parses a bundle back into its YAML preamble and file entries. Takes either the
 * bundle text or a path to a file holding it.
 */
export function unpack(input: string, vars?: Vars): Bundle {
  const text = read(input)
  const lines = text.split("\n")

  const { yaml, start } = preamble(lines)

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

  if (!vars) return { yaml, files }

  return {
    yaml,
    files: files.map(f => ({
      path: fill(f.path, vars),
      content: fill(f.content, vars),
    })),
  }
}

/**
 * Unpacks a bundle and writes it to disk, rooted at `opts.root`, then the YAML
 * `root`, then the cwd. Opts override anything declared in the preamble.
 */
export async function createProject(
  input: string,
  opts: CreateProjectOpts = {},
): Promise<CreateProjectResult> {
  const bundle = unpack(input, opts.vars)
  const declared = typeof bundle.yaml.root === "string" ? bundle.yaml.root : undefined
  const root = resolve(opts.root ?? declared ?? process.cwd())
  const overwrite = opts.overwrite ?? true

  const written: string[] = []

  for (const file of bundle.files) {
    const target = resolve(root, file.path)
    if (!inside(root, target)) {
      throw new Error(`bundle: ${file.path} escapes root ${root}`)
    }
    if (!overwrite && existsSync(target)) {
      throw new Error(`bundle: ${target} already exists`)
    }
    await Bun.write(target, file.content)
    written.push(target)
  }

  if (opts.installNodeModules) await install(root)

  return { root, yaml: bundle.yaml, files: written }
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

async function install(root: string): Promise<void> {
  if (!existsSync(resolve(root, "package.json"))) {
    throw new Error(`bundle: installNodeModules set but no package.json in ${root}`)
  }
  const proc = Bun.spawn(["bun", "install"], { cwd: root, stdout: "inherit", stderr: "inherit" })
  const code = await proc.exited
  if (code !== 0) throw new Error(`bundle: bun install exited with ${code}`)
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)
}
