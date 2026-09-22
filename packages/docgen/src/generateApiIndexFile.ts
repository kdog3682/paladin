import { mkdir } from "node:fs/promises"
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path"
import {
  camelCase,
  listFiles,
  pascalCase,
  resolveModuleFile,
  resolveScopedPath,
} from "@paladin/utils"
import { parse } from "./parse"
import type { ClassDoc, FunctionDoc, MethodDoc, Param } from "./parse.types"
import { resolveTypes, type TypeRequest } from "./resolve-types"

const SAMPLE_MARKERS = [".examples.", ".demo."]
const API_NAME = "api"

export type GenerateApiIndexFileOptions = {
  /** Directory scanned for sample files, relative to the package root. Defaults to "src". */
  src?: string
  /** Output path for the generated file, relative to the package root. Defaults to "src/browser/api.ts". */
  out?: string
  /** Filename markers identifying sample files. Defaults to [".examples.", ".demo."]. */
  markers?: string[]
  /** Class and function names to drop from the generated api. */
  exclude?: string[]
  /** Factory names to use instead of the camelCased class or function name, keyed by factory name. */
  aliases?: Record<string, string>
  /** Also generate a root index file re-exporting the discovered classes and functions directly (no factory wrapping). */
  root?: {
    /** Output path for the generated root index, relative to the package root. Defaults to "src/index.ts". */
    out?: string
    /**
     * Extra named exports to add to the root index. Each export's declaring file is discovered by
     * name — same as the classes and functions — so only the name is needed, not the path. Use
     * `"name as alias"` to rename an export, same syntax as a TypeScript export clause.
     *
     * @example ["fromJSON as deserialize", "toJSON as serialize", "display"]
     */
    includes?: string[]
  }
}

type ApiTarget = {
  /** Class or function name as declared in its source file. */
  name: string
  /** Absolute path of the file declaring the symbol. */
  file: string
  doc: ClassDoc | FunctionDoc
}

/** Named export to look for, or null for the module's default export. */
type Wanted = string | null

export type GenerateApiIndexFileResult = {
  api: string
  root?: string
}

export async function generateApiIndexFile(
  spec: string,
  options: GenerateApiIndexFileOptions = {},
): Promise<GenerateApiIndexFileResult> {
  const {
    src = "src",
    out = "src/browser/api.ts",
    markers = SAMPLE_MARKERS,
    exclude = [],
    aliases = {},
    root,
  } = options
  const dir = resolveScopedPath(spec)
  const outPath = resolvePath(dir, out)
  const outDir = dirname(outPath)
  const samples = await listFiles(join(dir, src), { glob: "**/*.{ts,tsx}", markers })
  const dropped = new Set(exclude)
  const found = new Map<string, ApiTarget>()
  for (const sample of samples) {
    if (sample === outPath) continue
    const doc = await parse(sample)
    for (const ref of doc.imports) {
      if (ref.typeOnly || ref.type === "builtin" || ref.type === "external") continue
      const module = resolveImportPath(ref.source, sample)
      if (!module) throw new Error(`cannot resolve "${ref.source}" imported by ${sample}`)
      for (const binding of ref.bindings) {
        if (binding.typeOnly || binding.kind === "namespace") continue
        const wanted: Wanted = binding.kind === "default" ? null : binding.imported ?? binding.name
        const entry = await findSymbol(module, wanted)
        if (!entry || dropped.has(entry.doc.name)) continue
        found.set(`${entry.file}#${entry.doc.name}`, entry)
      }
    }
  }
  const targets = [...found.values()]
  const types = await resolveTypeImports(targets)
  const factories = new Map(Object.entries(aliases).map(([factory, name]) => [name, factory]))
  await mkdir(outDir, { recursive: true })
  await Bun.write(outPath, renderApiFile(targets, { dir, outDir, types, factories }))
  const result: GenerateApiIndexFileResult = { api: outPath }
  if (root) {
    const rootOutPath = resolvePath(dir, root.out ?? "src/index.ts")
    const rootOutDir = dirname(rootOutPath)
    const includes = await resolveIncludes(dir, src, root.includes ?? [])
    await mkdir(rootOutDir, { recursive: true })
    await Bun.write(rootOutPath, renderRootIndexFile(targets, { dir, outDir: rootOutDir, includes }))
    result.root = rootOutPath
  }
  return result
}

type ResolvedInclude = { name: string, alias: string, file: string }

/** Resolves each `"name"` / `"name as alias"` include to the file that exports it. */
async function resolveIncludes(dir: string, src: string, includes: string[]): Promise<ResolvedInclude[]> {
  if (includes.length === 0) return []
  const index = await buildSymbolIndex(join(dir, src))
  return includes.map((spec) => {
    const match = spec.match(/^(\S+)\s+as\s+(\S+)$/)
    const name = match ? match[1] : spec
    const alias = match ? match[2] : spec
    const file = index.get(name)
    if (!file) throw new Error(`cannot find an export named "${name}" under ${join(dir, src)}`)
    return { name, alias, file }
  })
}

/** Declaring file of every named export under a directory, keyed by its exported name. */
async function buildSymbolIndex(rootDir: string): Promise<Map<string, string>> {
  const files = await listFiles(rootDir, { glob: "**/*.{ts,tsx}" })
  const index = new Map<string, string>()
  for (const file of files) {
    const doc = await parse(file)
    for (const symbol of doc.symbols) {
      if (symbol.exportKind === "none") continue
      const name = symbol.exportedAs ?? symbol.name
      if (!index.has(name)) index.set(name, file)
    }
  }
  return index
}

/** Whether a symbol is one `findSymbol` will surface — classes and functions, same as the generated api. */
function isApiSymbol(symbol: { kind: string }): symbol is ClassDoc | FunctionDoc {
  return symbol.kind === "class" || symbol.kind === "function"
}

async function findSymbol(
  file: string,
  wanted: Wanted,
  seen = new Set<string>(),
): Promise<ApiTarget | null> {
  const key = `${file}#${wanted ?? "*default*"}`
  if (seen.has(key)) return null
  seen.add(key)
  const doc = await parse(file)
  for (const symbol of doc.symbols) {
    if (!isApiSymbol(symbol) || symbol.exportKind === "none") continue
    if (wanted === null) {
      if (symbol.exportKind === "default") return { name: symbol.name, file, doc: symbol }
      continue
    }
    if ((symbol.exportedAs ?? symbol.name) === wanted) return { name: symbol.name, file, doc: symbol }
  }
  for (const ref of doc.reExports) {
    if (ref.typeOnly || ref.namespace) continue
    const module = resolveImportPath(ref.source, file)
    if (!module) continue
    if (ref.star) {
      if (wanted === null) continue
      const entry = await findSymbol(module, wanted, seen)
      if (entry) return entry
      continue
    }
    for (const binding of ref.bindings) {
      if (wanted === null ? binding.exported !== "default" : binding.exported !== wanted) continue
      const next: Wanted = binding.name === "default" ? null : binding.name
      const entry = await findSymbol(module, next, seen)
      if (entry) return entry
    }
  }
  return null
}

/** The file an import specifier points at, or null when it does not resolve. */
function resolveImportPath(source: string, fromFile: string): string | null {
  if (source.startsWith(".")) return resolveModuleFile(resolvePath(dirname(fromFile), source))
  const dir = toScopedDir(source)
  return dir ? resolveModuleFile(dir) : null
}

function toScopedDir(source: string): string | null {
  try {
    return resolveScopedPath(source)
  } catch {
    return null
  }
}

/** Declaring file of every named type used by a constructor or function signature, keyed by type name. */
async function resolveTypeImports(targets: ApiTarget[]): Promise<Map<string, string>> {
  const seeds: TypeRequest[] = []
  for (const target of targets) {
    for (const param of paramsOf(target.doc)) {
      for (const name of typeNames(param.type)) seeds.push({ name, from: target.file })
    }
  }
  const resolved = await resolveTypes(seeds, { load: parse })
  const types = new Map<string, string>()
  for (const type of resolved.types) types.set(type.doc.name, type.path)
  return types
}

function constructorOf(doc: ClassDoc): MethodDoc | null {
  return doc.methods.find((method) => method.name === "constructor") ?? null
}

/** Params to inspect for referenced types: a class's constructor, or a function's own params. */
function paramsOf(doc: ClassDoc | FunctionDoc): Param[] {
  if (doc.kind === "function") return doc.params
  return constructorOf(doc)?.params ?? []
}

const TYPE_TOKEN = /[A-Za-z_$][\w$]*/g

function typeNames(type: string): string[] {
  return [...new Set(type.match(TYPE_TOKEN) ?? [])]
}

function isInside(dir: string, file: string): boolean {
  const rel = relative(dir, file)
  return rel.length > 0 && !rel.startsWith("..")
}

function toImportSpecifier(fromDir: string, file: string): string {
  const rel = relative(fromDir, file).replace(/\.tsx?$/, "")
  const posix = rel.split(sep).join("/")
  return posix.startsWith(".") ? posix : `./${posix}`
}

function renderParam(param: Param): string {
  const rest = param.rest ? "..." : ""
  const optional = !param.rest && (param.optional || param.default !== undefined) ? "?" : ""
  return `${rest}${param.name}${optional}: ${param.type}`
}

function renderArg(param: Param): string {
  return param.rest ? `...${param.name}` : param.name
}

type RenderContext = {
  dir: string
  outDir: string
  types: Map<string, string>
  /** Factory name by class name, from the aliases option. */
  factories: Map<string, string>
}

function factoryName(target: ApiTarget, context: RenderContext): string {
  return context.factories.get(target.name) ?? camelCase(target.name)
}

/**
 * Resolve name collisions across different declaring files by keeping the first target seen for
 * each key — first match wins — except a class's synthetic factory name yields to an actual
 * function sharing it (e.g. class `Grid` -> wrapper `grid`, alongside a hand-written `grid()`
 * recipe function: the real function wins). Needed both for the `api` object, whose keys are
 * camelCased, and the root index, which re-exports raw names that can collide even more directly
 * (two unrelated `render` functions in different files, say).
 */
function dedupeTargets(targets: ApiTarget[], keyOf: (target: ApiTarget) => string): ApiTarget[] {
  const byKey = new Map<string, ApiTarget>()
  for (const target of targets) {
    const key = keyOf(target)
    const existing = byKey.get(key)
    if (!existing || (existing.doc.kind === "class" && target.doc.kind === "function")) {
      byKey.set(key, target)
    }
  }
  return [...byKey.values()]
}

function dedupeByFactoryName(targets: ApiTarget[], context: RenderContext): ApiTarget[] {
  return dedupeTargets(targets, (target) => factoryName(target, context))
}

type RootRenderContext = {
  dir: string
  outDir: string
  includes: ResolvedInclude[]
}

function renderRootIndexFile(rawTargets: ApiTarget[], context: RootRenderContext): string {
  const lines: string[] = ["// generated by @paladin/docgen — do not edit", ""]
  const targets = dedupeTargets(rawTargets, (target) => target.name)
  const values = new Map<string, Set<string>>()
  const add = (file: string, part: string) => {
    if (!isInside(context.dir, file)) return
    const specifier = toImportSpecifier(context.outDir, file)
    const parts = values.get(specifier) ?? new Set<string>()
    parts.add(part)
    values.set(specifier, parts)
  }
  for (const target of targets) add(target.file, target.name)
  for (const [specifier, parts] of values) {
    lines.push(`export { ${[...parts].join(", ")} } from "${specifier}"`)
  }
  if (context.includes.length > 0) {
    const includeValues = new Map<string, Set<string>>()
    for (const { name, alias, file } of context.includes) {
      const specifier = toImportSpecifier(context.outDir, file)
      const parts = includeValues.get(specifier) ?? new Set<string>()
      parts.add(name === alias ? name : `${name} as ${alias}`)
      includeValues.set(specifier, parts)
    }
    lines.push("", ...[...includeValues].map(([specifier, parts]) => `export { ${[...parts].join(", ")} } from "${specifier}"`))
  }
  return lines.join("\n") + "\n"
}

function renderApiFile(rawTargets: ApiTarget[], context: RenderContext): string {
  const typeName = pascalCase(API_NAME)
  const lines: string[] = ["// generated by @paladin/docgen — do not edit", ""]
  const targets = dedupeByFactoryName(rawTargets, context)
  if (targets.length === 0) {
    lines.push(`export const ${API_NAME} = {}`, "", `export type ${typeName} = typeof ${API_NAME}`)
    return lines.join("\n") + "\n"
  }
  const values = new Map<string, Set<string>>()
  const typeOnly = new Map<string, Set<string>>()
  const add = (group: Map<string, Set<string>>, file: string, name: string) => {
    if (!isInside(context.dir, file)) return
    const specifier = toImportSpecifier(context.outDir, file)
    const names = group.get(specifier) ?? new Set<string>()
    names.add(name)
    group.set(specifier, names)
  }
  for (const target of targets) {
    const factory = factoryName(target, context)
    const importedAs = target.doc.kind === "function" && factory !== target.name
      ? `${target.name} as ${factory}`
      : target.name
    add(values, target.file, importedAs)
    for (const param of paramsOf(target.doc)) {
      for (const name of typeNames(param.type)) {
        const file = context.types.get(name)
        if (file) add(typeOnly, file, name)
      }
    }
  }
  for (const [specifier, names] of values) {
    lines.push(`import { ${[...names].join(", ")} } from "${specifier}"`)
  }
  for (const [specifier, names] of typeOnly) {
    const wanted = [...names].filter((name) => !values.get(specifier)?.has(name))
    if (wanted.length === 0) continue
    lines.push(`import type { ${wanted.join(", ")} } from "${specifier}"`)
  }
  lines.push("")
  // Functions are already callable as-is (imported above, aliased if needed) — only classes need a
  // `new X(...)` factory wrapper.
  for (const target of targets) {
    if (target.doc.kind !== "class") continue
    const factory = factoryName(target, context)
    const ctor = constructorOf(target.doc)
    const params = ctor
      ? ctor.params.map(renderParam).join(", ")
      : `...args: ConstructorParameters<typeof ${target.name}>`
    const args = ctor ? ctor.params.map(renderArg).join(", ") : "...args"
    lines.push(
      `function ${factory}(${params}): ${target.name} {`,
      `  return new ${target.name}(${args})`,
      "}",
      "",
    )
  }
  lines.push(`export const ${API_NAME} = {`)
  for (const target of targets) lines.push(`  ${factoryName(target, context)},`)
  lines.push("}", "", `export type ${typeName} = typeof ${API_NAME}`)
  return lines.join("\n") + "\n"
}
