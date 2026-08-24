import { resolve as resolvePath } from "node:path"
import { parse } from "./parse"
import type { ClassDoc, FileDoc, FunctionDoc, MethodDoc, Param, SymbolDoc, TypeDoc } from "./parse.types"
import { createLabeler, deriveRoot } from "./resolve-module"
import { resolveTypes, type ExternalRef, type TypeRequest } from "./resolve-types"

export type DocgenOptions = {
  /** Group files sharing a directory under one header. Defaults to true. */
  collate?: boolean
  /** Minimum files in a directory before collating it. Defaults to 3. */
  collateThreshold?: number
  /** Include non-public class members. Defaults to false. */
  includePrivate?: boolean
  /** Emit doc comments for type members. Defaults to true. */
  includeMemberDocs?: boolean
}

export type DocumentedSymbol = FunctionDoc | ClassDoc
export type TypeSection = { path: string, types: TypeDoc[] }
export type SymbolSection = { path: string, symbols: DocumentedSymbol[] }
export type DocgenResult = {
  /** Package name derived from the nearest package.json, when there is one. */
  package: string | null
  externals: ExternalRef[]
  types: TypeSection[]
  files: SymbolSection[]
  unresolved: TypeRequest[]
}

type RenderedSection = { path: string, entries: string[] }

export async function docgen(files: string[], options: DocgenOptions = {}): Promise<string> {
  return render(await collect(files), options)
}

export async function collect(files: string[]): Promise<DocgenResult> {
  const root = await deriveRoot(files)
  const label = createLabeler(root)
  const cache = new Map<string, Promise<FileDoc>>()
  const load = (path: string): Promise<FileDoc> => {
    let pending = cache.get(path)
    if (!pending) {
      pending = parse(path)
      cache.set(path, pending)
    }
    return pending
  }

  const seeds: TypeRequest[] = []
  const sections: SymbolSection[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const path = resolvePath(file)
    if (seen.has(path)) continue
    seen.add(path)
    const doc = await load(path)
    const symbols = doc.symbols.filter(isDocumented)
    if (symbols.length === 0) continue
    sections.push({ path: await label(path), symbols })
    for (const symbol of symbols) {
      for (const name of symbol.typeReferences) seeds.push({ name, from: path })
    }
  }

  const resolved = await resolveTypes(seeds, { load })
  const grouped = new Map<string, TypeDoc[]>()
  for (const type of resolved.types) {
    const path = await label(type.path)
    const bucket = grouped.get(path)
    if (bucket) bucket.push(type.doc)
    else grouped.set(path, [type.doc])
  }
  const types = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([path, docs]) => ({ path, types: docs.sort((a, b) => a.loc.line - b.loc.line) }))

  return {
    package: root.name,
    externals: resolved.externals,
    types,
    files: sections,
    unresolved: resolved.unresolved,
  }
}

function render(result: DocgenResult, options: DocgenOptions): string {
  const blocks: string[] = []
  if (result.package) blocks.push(result.package)
  if (result.externals.length > 0) blocks.push(renderExternals(result.externals).join("\n"))

  const typeSections = result.types.map((section) => ({
    path: section.path,
    entries: section.types.map((doc) => renderType(doc, options).join("\n")),
  }))
  const fileSections = result.files.map((section) => ({
    path: section.path,
    entries: section.symbols.map((symbol) => renderSymbol(symbol, options).join("\n")),
  }))

  blocks.push(...renderSections(typeSections, options))
  blocks.push(...renderSections(fileSections, options))
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`
}

function renderSections(sections: RenderedSection[], options: DocgenOptions): string[] {
  const threshold = options.collateThreshold ?? 3
  const groups = new Map<string, RenderedSection[]>()
  const order: string[] = []
  for (const section of sections) {
    const dir = dirOf(section.path)
    let bucket = groups.get(dir)
    if (!bucket) {
      bucket = []
      groups.set(dir, bucket)
      order.push(dir)
    }
    bucket.push(section)
  }

  const blocks: string[] = []
  for (const dir of order) {
    const group = groups.get(dir)!
    if (options.collate !== false && dir && group.length >= threshold) {
      const files = group.map((section) => [`## ./${baseOf(section.path)}`, section.entries.join("\n\n")].join("\n"))
      blocks.push([`# ${dir}`, ...files].join("\n\n"))
      continue
    }
    for (const section of group) {
      blocks.push([`# ${section.path}`, section.entries.join("\n\n")].join("\n"))
    }
  }
  return blocks
}

function dirOf(path: string): string {
  const cut = path.lastIndexOf("/")
  return cut === -1 ? "" : path.slice(0, cut + 1)
}

function baseOf(path: string): string {
  const cut = path.lastIndexOf("/")
  return cut === -1 ? path : path.slice(cut + 1)
}

function renderExternals(externals: ExternalRef[]): string[] {
  const grouped = new Map<string, string[]>()
  for (const external of externals) {
    const binding = external.local === external.name ? external.name : `${external.name} as ${external.local}`
    const bucket = grouped.get(external.source)
    if (bucket) bucket.push(binding)
    else grouped.set(external.source, [binding])
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([source, names]) => `import type { ${[...new Set(names)].sort().join(", ")} } from "${source}"`)
}

function isDocumented(symbol: SymbolDoc): symbol is DocumentedSymbol {
  if (symbol.kind !== "function" && symbol.kind !== "class") return false
  return symbol.exportKind !== "none"
}

function renderSymbol(symbol: DocumentedSymbol, options: DocgenOptions): string[] {
  const lines = symbol.kind === "function" ? renderFunction(symbol) : renderClass(symbol, options)
  return [...lines, ...describe(symbol.description)]
}

function renderFunction(doc: FunctionDoc): string[] {
  const head = doc.async ? "async function" : "function"
  const star = doc.generator ? "*" : ""
  return [`${head}${star} ${name(doc)}${generics(doc.typeParams)}(${params(doc.params)})${returns(doc.returns)}`]
}

function renderClass(doc: ClassDoc, options: DocgenOptions): string[] {
  const heritage = [
    doc.extends ? ` extends ${doc.extends}` : "",
    doc.implements.length > 0 ? ` implements ${doc.implements.join(", ")}` : "",
  ].join("")
  const head = `${doc.abstract ? "abstract " : ""}class ${name(doc)}${generics(doc.typeParams)}${heritage}`
  const body: string[] = []
  for (const property of doc.properties) {
    if (!visible(property.visibility, options)) continue
    body.push(...member(property.description, propertySignature(property, true, false), options))
  }
  for (const method of doc.methods) {
    if (!visible(method.visibility, options)) continue
    body.push(...member(method.description, methodSignature(method, false), options))
  }
  return [head, ...body.map((line) => `  ${line}`)]
}

function renderType(doc: TypeDoc, options: DocgenOptions): string[] {
  const head = `${name(doc)}${generics(doc.typeParams)}`
  if (doc.kind === "enum") {
    const members = doc.properties.map((property) => {
      const value = property.default === undefined ? "" : ` = ${property.default}`
      return `  ${property.name}${value},`
    })
    return [`enum ${head} {`, ...members, "}"]
  }

  const body: string[] = []
  for (const property of doc.properties) {
    body.push(...member(property.description, propertySignature(property, false), options))
  }
  for (const method of doc.methods) {
    body.push(...member(method.description, methodSignature(method, false), options))
  }
  const indented = body.map((line) => `  ${line}`)

  if (doc.kind === "interface") {
    const heritage = doc.extends.length > 0 ? ` extends ${doc.extends.join(", ")}` : ""
    if (indented.length === 0) return [`interface ${head}${heritage} {}`]
    return [`interface ${head}${heritage} {`, ...indented, "}"]
  }

  const intersect = doc.extends.length > 0 ? `${doc.extends.join(" & ")} & ` : ""
  if (indented.length > 0) return [`type ${head} = ${intersect}{`, ...indented, "}"]
  if (doc.value !== undefined) return `type ${head} = ${intersect}${clean(doc.value)}`.split("\n")
  return [`type ${head} = ${intersect}{}`]
}

function member(description: string | undefined, signature: string, options: DocgenOptions): string[] {
  const lines: string[] = []
  if (options.includeMemberDocs !== false && description) lines.push(`/** ${oneLine(description)} */`)
  lines.push(signature)
  return lines
}

function propertySignature(property: Param, includeValue: boolean, includeModifiers = true): string {
  const prefix = [
    includeModifiers && property.visibility && property.visibility !== "public" ? property.visibility : "",
    property.static ? "static" : "",
    property.abstract ? "abstract" : "",
    includeModifiers && property.readonly ? "readonly" : "",
  ].filter(Boolean).join(" ")
  const value = includeValue && property.default !== undefined ? ` = ${property.default}` : ""
  const head = prefix ? `${prefix} ` : ""
  return `${head}${property.name}${property.optional ? "?" : ""}${returns(property.type)}${value}`
}

function methodSignature(method: MethodDoc, includeVisibility: boolean): string {
  const prefix = [
    includeVisibility && method.visibility !== "public" ? method.visibility : "",
    method.static ? "static" : "",
    method.abstract ? "abstract" : "",
    method.async ? "async" : "",
    method.getter ? "get" : "",
    method.setter ? "set" : "",
  ].filter(Boolean).join(" ")
  const head = prefix ? `${prefix} ` : ""
  const optional = method.optional ? "?" : ""
  return `${head}${method.name}${optional}${generics(method.typeParams)}(${params(method.params)})${returns(method.returns)}`
}

function params(list: Param[]): string {
  return list.map(paramSignature).join(", ")
}

function paramSignature(param: Param): string {
  const prefix = [
    param.visibility && param.visibility !== "public" ? param.visibility : "",
    param.readonly ? "readonly" : "",
  ].filter(Boolean).join(" ")
  const head = prefix ? `${prefix} ` : ""
  const rest = param.rest ? "..." : ""
  const value = param.default === undefined ? "" : ` = ${param.default}`
  return `${head}${rest}${param.name}${param.optional ? "?" : ""}${returns(param.type)}${value}`
}

function generics(typeParams: string[]): string {
  return typeParams.length === 0 ? "" : `<${typeParams.map(clean).join(", ")}>`
}

function returns(type: string | undefined): string {
  return type ? `: ${clean(type)}` : ""
}

function name(doc: { name: string, exportedAs?: string }): string {
  return doc.exportedAs && doc.exportedAs !== doc.name ? doc.exportedAs : doc.name
}

function describe(description: string): string[] {
  if (!description) return []
  return description.trim().split("\n").map((line) => line.trim())
}

function visible(visibility: string | undefined, options: DocgenOptions): boolean {
  if (options.includePrivate) return true
  return visibility === undefined || visibility === "public"
}

function clean(text: string): string {
  return text.replace(/\s+\n/g, "\n").trim()
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
