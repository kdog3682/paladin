import type { DocgenResult, DocgenOptions, DocumentedSymbol } from "./docgen"
import { type ExternalRef } from "./resolve-types"
import type { FunctionDoc, ClassDoc, TypeDoc, Param, MethodDoc } from "./parse.types"
import { annotate, assign, formatType, indentTail, type FormatOpts } from "./render.format"
import { createInliner, type Inliner } from "./render.inline"

export type RenderOptions = DocgenOptions & {
  /** fold a type into the one signature that uses it, when nothing else references it. defaults to true */
  inline?: boolean
  /** import every export from the package barrel and drop the per-file headings. defaults to true, using the package name. a string sets the specifier, false renders per-file sections */
  barrel?: boolean | string
  /** how wide unions, objects, params and imports may get before breaking across lines. defaults to 80 */
  width?: number
}

type TypeFn = (text: string) => string

type Context = {
  options: RenderOptions
  format: FormatOpts
  inliner: Inliner
  /** expands inlined names and pretty prints a type string */
  type: TypeFn
}

type RenderedSection = {
  path: string
  entries: string[]
}

/** types stay raw inside an expression, which is formatted as a whole afterwards */
const RAW: TypeFn = (text) => oneLine(text)

export function render(result: DocgenResult, options: RenderOptions): string {
  const format: FormatOpts = { width: options.width ?? 80, comments: options.includeMemberDocs !== false }
  const inliner = createInliner(result, {
    visible: (visibility) => visible(visibility, options),
    expression: (doc) => expression(doc, options),
  }, options.inline !== false)
  const ctx: Context = {
    options,
    format,
    inliner,
    type: (text) => formatType(inliner.expand(text), format),
  }

  const barrel = barrelSpecifier(result, options.barrel)
  const blocks: string[] = []
  if (result.package) blocks.push(result.package)
  const imports = [...renderExternals(result.externals, format.width), ...renderBarrel(result, barrel, ctx)]
  if (imports.length > 0) blocks.push(imports.join("\n"))

  // types and symbols from the same file share one section
  const sections = new Map<string, string[]>()
  const push = (path: string, entries: string[]) => {
    if (entries.length === 0) return
    const bucket = sections.get(path)
    if (bucket) bucket.push(...entries)
    else sections.set(path, [...entries])
  }
  for (const section of result.types) {
    const kept = section.types.filter((doc) => !inliner.inlined.has(doc.name))
    push(section.path, kept.map((doc) => renderType(doc, ctx).join("\n")))
  }
  for (const section of result.files) {
    push(section.path, section.symbols.map((symbol) => renderSymbol(symbol, ctx).join("\n")))
  }

  // with a barrel everything is imported from one place, so file headings are noise
  if (barrel) blocks.push(...[...sections.values()].flat())
  else {
    const rendered: RenderedSection[] = [...sections].map(([path, entries]) => ({ path, entries }))
    blocks.push(...renderSections(rendered, options))
  }
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
      const files = group.map((section) => [`## ./${baseOf(section.path)}`, section.entries.join("\n\n")].join("\n\n"))
      blocks.push([`# ${dir}`, ...files].join("\n\n"))
      continue
    }
    for (const section of group) {
      blocks.push([`# ${section.path}`, section.entries.join("\n\n")].join("\n\n"))
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

function renderExternals(externals: ExternalRef[], width: number): string[] {
  const grouped = new Map<string, string[]>()
  for (const external of externals) {
    const binding = external.local === external.name ? external.name : `${external.name} as ${external.local}`
    const bucket = grouped.get(external.source)
    if (bucket) bucket.push(binding)
    else grouped.set(external.source, [binding])
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([source, names]) => importLine([...new Set(names)].sort(), source, width, true))
}

function renderBarrel(result: DocgenResult, specifier: string | undefined, ctx: Context): string[] {
  if (!specifier) return []

  const bindings = new Map<string, string>()
  for (const section of result.files) {
    for (const symbol of section.symbols) bindings.set(name(symbol), name(symbol))
  }
  for (const section of result.types) {
    for (const doc of section.types) {
      if (ctx.inliner.inlined.has(doc.name)) continue
      const exported = name(doc)
      if (!bindings.has(exported)) bindings.set(exported, doc.kind === "enum" ? exported : `type ${exported}`)
    }
  }
  if (bindings.size === 0) return []

  const sorted = [...bindings].sort((a, b) => a[0].localeCompare(b[0])).map(([, binding]) => binding)
  return [importLine(sorted, specifier, ctx.format.width)]
}

function barrelSpecifier(result: DocgenResult, barrel: boolean | string | undefined): string | undefined {
  if (typeof barrel === "string") return barrel || undefined
  if (barrel === false || !result.package) return undefined
  return result.package.split("\n")[0].replace(/^#+\s*/, "").trim() || undefined
}

function importLine(bindings: string[], source: string, width: number, typeOnly = false): string {
  const keyword = typeOnly ? "import type" : "import"
  const line = `${keyword} { ${bindings.join(", ")} } from "${source}"`
  if (line.length <= width) return line
  return [`${keyword} {`, ...bindings.map((binding) => `  ${binding},`), `} from "${source}"`].join("\n")
}

function renderSymbol(symbol: DocumentedSymbol, ctx: Context): string[] {
  const lines = symbol.kind === "function" ? renderFunction(symbol, ctx) : renderClass(symbol, ctx)
  return [...docBlock(symbol.description), ...lines]
}

function renderFunction(doc: FunctionDoc, ctx: Context): string[] {
  const keyword = doc.async ? "async function" : "function"
  const head = `${keyword}${doc.generator ? "*" : ""} ${name(doc)}${generics(doc.typeParams, ctx.type)}`
  return signature(head, doc.params, doc.returns, ctx.type, ctx.format.width).split("\n")
}

function renderClass(doc: ClassDoc, ctx: Context): string[] {
  const heritage = [
    doc.extends ? ` extends ${oneLine(doc.extends)}` : "",
    doc.implements.length > 0 ? ` implements ${doc.implements.map(oneLine).join(", ")}` : "",
  ].join("")
  const head = `${doc.abstract ? "abstract " : ""}class ${name(doc)}${generics(doc.typeParams, ctx.type)}${heritage}`

  const body: string[] = []
  for (const property of doc.properties) {
    if (!visible(property.visibility, ctx.options)) continue
    if (property.readonly) continue
    body.push(...member(property.description, propertySignature(property, true, ctx.type), ctx))
  }
  for (const method of doc.methods) {
    if (!visible(method.visibility, ctx.options)) continue
    body.push(...member(method.description, methodSignature(method, true, ctx.type, ctx.format.width), ctx))
  }
  if (body.length === 0) return [`${head} {}`]
  return [`${head} {`, ...body.map((line) => (line ? `  ${line}` : line)), "}"]
}

function renderType(doc: TypeDoc, ctx: Context): string[] {
  const head = `${name(doc)}${generics(doc.typeParams, ctx.type)}`
  const docs = docBlock(typeDescription(doc))

  if (doc.kind === "enum") {
    const members = doc.properties.flatMap((property) => {
      const value = property.default === undefined ? "" : ` = ${property.default}`
      return member(property.description, `${property.name}${value},`, ctx).map((line) => `  ${line}`)
    })
    if (members.length === 0) return [...docs, `enum ${head} {}`]
    return [...docs, `enum ${head} {`, ...members, "}"]
  }

  if (doc.kind === "interface") {
    const heritage = doc.extends.length > 0 ? ` extends ${doc.extends.join(", ")}` : ""
    const object = objectExpression(doc, ctx.options)
    const body = object ? formatType(ctx.inliner.expand(object), ctx.format, true) : "{}"
    return [...docs, ...`interface ${head}${heritage} ${body}`.split("\n")]
  }

  const value = formatType(ctx.inliner.expand(expression(doc, ctx.options)), ctx.format, true)
  return [...docs, ...assign(`type ${head}`, value).split("\n")]
}

/** a type's whole definition as one expression. used for aliases, and for splicing inlined types */
function expression(doc: TypeDoc, options: RenderOptions): string {
  const object = objectExpression(doc, options)
  const value = object ?? doc.value
  if (doc.extends.length === 0) return value ?? "{}"
  if (value === undefined) return doc.extends.join(" & ")
  return [...doc.extends, object ? value : `(${value})`].join(" & ")
}

function objectExpression(doc: TypeDoc, options: RenderOptions): string | undefined {
  const members = [
    ...doc.properties.map((property) => withComment(property.description, propertySignature(property, false, RAW), options)),
    ...doc.methods.map((method) => withComment(method.description, methodSignature(method, false, RAW, Infinity), options)),
  ]
  return members.length === 0 ? undefined : `{ ${members.join("; ")} }`
}

function withComment(description: string | undefined, signature: string, options: RenderOptions): string {
  if (options.includeMemberDocs === false || !description) return signature
  return `/* ${oneLine(description).replace(/\*\//g, "*\\/")} */ ${signature}`
}

function member(description: string | undefined, signature: string, ctx: Context): string[] {
  const lines: string[] = []
  if (ctx.options.includeMemberDocs !== false && description) lines.push(`/** ${oneLine(description)} */`)
  lines.push(...signature.split("\n"))
  return lines
}

function propertySignature(property: Param, includeValue: boolean, type: TypeFn): string {
  const prefix = [
    property.visibility && property.visibility !== "public" ? property.visibility : "",
    property.static ? "static" : "",
    property.abstract ? "abstract" : "",
    property.readonly ? "readonly" : "",
  ].filter(Boolean).join(" ")
  const head = `${prefix ? `${prefix} ` : ""}${property.name}${property.optional ? "?" : ""}`
  const value = includeValue && property.default !== undefined ? ` = ${property.default}` : ""
  return `${property.type ? annotate(head, type(property.type)) : head}${value}`
}

function methodSignature(method: MethodDoc, includeVisibility: boolean, type: TypeFn, width: number): string {
  const prefix = [
    includeVisibility && method.visibility !== "public" ? method.visibility : "",
    method.static ? "static" : "",
    method.abstract ? "abstract" : "",
    method.async ? "async" : "",
    method.getter ? "get" : "",
    method.setter ? "set" : "",
  ].filter(Boolean).join(" ")
  const head = `${prefix ? `${prefix} ` : ""}${method.name}${method.optional ? "?" : ""}${generics(method.typeParams, type)}`
  return signature(head, method.params, method.returns, type, width)
}

/** params stay on one line unless there are several and the line runs past the width */
function signature(head: string, list: Param[], returnType: string | undefined, type: TypeFn, width: number): string {
  const rendered = list.map((param) => paramSignature(param, type))
  const close = returnType ? annotate(")", type(returnType)) : ")"
  const inline = `${head}(${rendered.join(", ")}${close}`
  if (rendered.length < 2 || inline.split("\n")[0].length <= width) return inline
  const broken = rendered.map((param) => `  ${indentTail(param, "  ")},`)
  return [`${head}(`, ...broken, close].join("\n")
}

function paramSignature(param: Param, type: TypeFn): string {
  const prefix = [
    param.visibility && param.visibility !== "public" ? param.visibility : "",
    param.readonly ? "readonly" : "",
  ].filter(Boolean).join(" ")
  const head = `${prefix ? `${prefix} ` : ""}${param.rest ? "..." : ""}${param.name}${param.optional ? "?" : ""}`
  const value = param.default === undefined ? "" : ` = ${param.default}`
  return `${param.type ? annotate(head, type(param.type)) : head}${value}`
}

function generics(typeParams: string[], type: TypeFn): string {
  return typeParams.length === 0 ? "" : `<${typeParams.map(type).join(", ")}>`
}

function name(doc: { name: string, exportedAs?: string }): string {
  return doc.exportedAs && doc.exportedAs !== doc.name ? doc.exportedAs : doc.name
}

function typeDescription(doc: TypeDoc): string | undefined {
  return "description" in doc && typeof doc.description === "string" ? doc.description : undefined
}

/** a description as a doc comment above its declaration */
function docBlock(description: string | undefined): string[] {
  const text = description?.trim()
  if (!text) return []
  const lines = text.split("\n").map((line) => line.trim())
  if (lines.length === 1) return [`/** ${lines[0]} */`]
  return ["/**", ...lines.map((line) => (line ? ` * ${line}` : " *")), " */"]
}

function visible(visibility: string | undefined, options: DocgenOptions): boolean {
  if (options.includePrivate) return true
  return visibility === undefined || visibility === "public"
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
