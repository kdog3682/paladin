import { basename, dirname, relative, resolve, sep } from "node:path"
import { resolveRelativePath, filePartitions } from "@paladin/utils"
import { parse } from "./parse"
import type { FileDoc } from "./parse.types"

export type EntryPoint = {
  file: string
  symbols: string[]
}

export type EntryPointExclude = {
  files?: string[]
  symbols?: string[]
}

export type CollectEntryPointsOptions = {
  exclude?: EntryPointExclude
}

export async function collectEntryPoints(
  dir: string,
  options: CollectEntryPointsOptions = {},
): Promise<EntryPoint[]> {
  const root = resolve(dir)
  const excludedFiles = options.exclude?.files ?? []
  const excludedSymbols = new Set(options.exclude?.symbols ?? [])
  const [demoFiles, testFiles] = filePartitions(root, ["demo", "test"])
  const specs = demoFiles.length > 0 ? demoFiles : testFiles
  const specSet = new Set([...demoFiles, ...testFiles])
  if (specs.length < 3) {
    return filePartitions(root, ["source"])[0]
  }

  const parsed = await Promise.all(
    specs
      .filter((spec) => !isExcluded(spec, root, excludedFiles))
      .map(async (spec) => ({ spec, doc: await parse(spec) })),
  )

  const entries = new Map<string, { symbols: Set<string>, named: boolean }>()
  for (const { spec, doc } of parsed) {
    for (const { source, symbols } of localSources(doc)) {
      const target = resolveRelativePath(source, dirname(spec))
      if (!target) continue
      if (specSet.has(target)) continue
      if (isExcluded(target, root, excludedFiles)) continue
      const entry = entries.get(target) ?? { symbols: new Set<string>(), named: false }
      for (const symbol of symbols) {
        entry.named = true
        if (excludedSymbols.has(symbol)) continue
        entry.symbols.add(symbol)
      }
      entries.set(target, entry)
    }
  }

  return [...entries]
    .filter(([, entry]) => !entry.named || entry.symbols.size > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, entry]) => ({ file, symbols: [...entry.symbols].sort() }))
}

type LocalSource = {
  source: string
  symbols: string[]
}

function localSources(doc: FileDoc): LocalSource[] {
  const sources: LocalSource[] = []
  for (const ref of doc.imports) {
    if (ref.type !== "relative") continue
    if (ref.typeOnly) continue
    const bindings = ref.bindings ?? []
    if (bindings.length > 0 && bindings.every((b) => b.typeOnly)) continue
    sources.push({ source: ref.source, symbols: valueSymbols(bindings) })
  }
  for (const ref of doc.reExports) {
    if (ref.type !== "relative") continue
    if (ref.typeOnly) continue
    sources.push({ source: ref.source, symbols: valueSymbols(ref.bindings ?? []) })
  }
  return sources
}

function valueSymbols(bindings: FileDoc["imports"][number]["bindings"]): string[] {
  return bindings.filter((b) => !b.typeOnly).map((b) => b.name)
}

function isExcluded(file: string, root: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false
  const rel = relative(root, file).split(sep).join("/")
  const name = basename(file)
  return patterns.some((entry) => {
    const pattern = entry.replace(/^\.\//, "").split(sep).join("/")
    if (!pattern) return false
    return name === pattern || rel === pattern || rel.endsWith(`/${pattern}`)
  })
}
