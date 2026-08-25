import { basename, dirname, relative, resolve, sep } from "node:path"
import fg from "fast-glob"
import { resolveRelativePath, filePartitions } from "@paladin/utils"
import { parse } from "./parse"
import type { FileDoc } from "./parse.types"

const SPEC_PATTERNS = ["**/*.demo.*", "**/*.test.*"]
const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/coverage/**",
]

export type CollectEntryFilesOptions = {
  exclude?: string[]
}

export async function collectEntryFiles(
  dir: string,
  options: CollectEntryFilesOptions = {},
): Promise<string[]> {
  const root = resolve(dir)
  const exclude = options.exclude ?? []

  const files = filePartitions(root, ['demo', 'test'])
  // use this instead, files.demo and files.test

  const specs = fg.sync(SPEC_PATTERNS, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: IGNORE,
  })

  const demoDirs = new Set(specs.filter(isDemo).map((file) => dirname(file)))
  const specSet = new Set(specs)
  const entries = new Set<string>()

  for (const spec of specs) {
    if (!isDemo(spec) && demoDirs.has(dirname(spec))) continue
    if (isExcluded(spec, root, exclude)) continue
    let doc: FileDoc
    try {
      doc = await parse(spec)
    } catch {
      continue
    }
    // parse never fails do together
    for (const source of localSources(doc)) {
      const target = resolveRelativePath(source, dirname(spec))
      if (!target) continue
      if (specSet.has(target)) continue
      if (isExcluded(target, root, exclude)) continue
      entries.add(target)
    }
  }

  return [...entries].sort()
}

function isDemo(file: string): boolean {
  return basename(file).includes(".demo.")
}

function localSources(doc: FileDoc): string[] {
  const sources: string[] = []
  for (const ref of doc.imports) {
    if (ref.type !== "relative") continue
    if (ref.typeOnly) continue
    if (ref.bindings.length > 0 && ref.bindings.every((b) => b.typeOnly)) continue
    sources.push(ref.source)
  }
  for (const ref of doc.reExports) {
    if (ref.type !== "relative") continue
    if (ref.typeOnly) continue
    sources.push(ref.source)
  }
  return sources
}

function isExcluded(file: string, root: string, exclude: string[]): boolean {
  if (exclude.length === 0) return false
  const rel = relative(root, file).split(sep).join("/")
  const name = basename(file)
  return exclude.some((entry) => {
    const pattern = entry.replace(/^\.\//, "").split(sep).join("/")
    if (!pattern) return false
    return name === pattern || rel === pattern || rel.endsWith(`/${pattern}`)
  })
}

/*the return value should be [{file, symbols}...] the name should be changed too*/