import type {
  ClassDoc,
  ConstDoc,
  FunctionDoc,
  MethodDoc,
  Param,
  SymbolDoc,
  TypeDoc,
} from "./parse.types"

const INDENT = "  "

export type RenderOptions = {
  includeNonPublic?: boolean
}

export function docComment(description: string | undefined): string {
  const text = (description ?? "").trim()
  if (!text) return ""
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  if (lines.length === 1) return `/** ${lines[0]} */`
  return ["/**", ...lines.map((line) => ` * ${line}`.trimEnd()), " */"].join("\n")
}

export function renderTypeParams(typeParams: string[] | undefined): string {
  if (!typeParams || typeParams.length === 0) return ""
  return `<${typeParams.join(", ")}>`
}

export function renderParam(param: Param, opts: { modifiers?: boolean } = {}): string {
  let head = ""
  if (opts.modifiers) {
    if (param.visibility && param.visibility !== "public") head += `${param.visibility} `
    if (param.static) head += "static "
    if (param.abstract) head += "abstract "
    if (param.readonly) head += "readonly "
  }
  const name = `${param.rest ? "..." : ""}${param.name}${param.optional ? "?" : ""}`
  const type = param.type ? `: ${param.type}` : ""
  const value = param.default === undefined ? "" : ` = ${param.default}`
  return `${head}${name}${type}${value}`
}

export function renderParams(params: Param[]): string {
  return params.map((param) => renderParam(param)).join(", ")
}

export function renderMethod(method: MethodDoc): string {
  const signature = method.signature.trim().replace(/[;,]$/, "")
  if (signature) return signature
  let head = ""
  if (method.visibility !== "public") head += `${method.visibility} `
  if (method.static) head += "static "
  if (method.abstract) head += "abstract "
  if (method.async) head += "async "
  if (method.getter) head += "get "
  if (method.setter) head += "set "
  const name = `${method.name}${method.optional ? "?" : ""}`
  const returns = method.returns ? `: ${method.returns}` : ""
  return `${head}${name}${renderTypeParams(method.typeParams)}(${renderParams(method.params)})${returns}`
}

function isVisible(visibility: Param["visibility"], opts: RenderOptions): boolean {
  if (opts.includeNonPublic) return true
  return !visibility || visibility === "public"
}

function block(head: string, lines: string[]): string {
  if (lines.length === 0) return `${head} {}`
  return `${head} {\n${lines.map((line) => (line ? INDENT + line : "")).join("\n")}\n}`
}

function memberLines(
  properties: Param[],
  methods: MethodDoc[],
  opts: RenderOptions,
  asEnum = false,
): string[] {
  const lines: string[] = []
  for (const property of properties) {
    if (!isVisible(property.visibility, opts)) continue
    const comment = docComment(property.description)
    if (comment) lines.push(...comment.split("\n"))
    lines.push(
      asEnum
        ? `${property.name}${property.default === undefined ? "" : ` = ${property.default}`}`
        : renderParam(property, { modifiers: true }),
    )
  }
  for (const method of methods) {
    if (!isVisible(method.visibility, opts)) continue
    const comment = docComment(method.description)
    if (comment) lines.push(...comment.split("\n"))
    lines.push(renderMethod(method))
  }
  return lines
}

function renderFunction(fn: FunctionDoc): string {
  const lines = fn.overloads.map((overload) => overload.trim()).filter(Boolean)
  const signature = fn.signature.trim()
  if (signature) lines.push(signature)
  else {
    const head = `${fn.async ? "async " : ""}function${fn.generator ? "*" : ""}`
    const returns = fn.returns ? `: ${fn.returns}` : ""
    lines.push(
      `${head} ${fn.name}${renderTypeParams(fn.typeParams)}(${renderParams(fn.params)})${returns}`,
    )
  }
  return lines.join("\n")
}

function renderClass(cls: ClassDoc, opts: RenderOptions): string {
  let head = `${cls.abstract ? "abstract " : ""}class ${cls.name}${renderTypeParams(cls.typeParams)}`
  if (cls.extends) head += ` extends ${cls.extends}`
  if (cls.implements.length > 0) head += ` implements ${cls.implements.join(", ")}`
  return block(head, memberLines(cls.properties, cls.methods, opts))
}

function renderType(type: TypeDoc, opts: RenderOptions): string {
  const generics = renderTypeParams(type.typeParams)
  const hasMembers = type.properties.length > 0 || type.methods.length > 0

  if (type.kind === "enum") {
    return block(`enum ${type.name}`, memberLines(type.properties, [], opts, true))
  }

  if (type.kind === "interface") {
    let head = `interface ${type.name}${generics}`
    if (type.extends.length > 0) head += ` extends ${type.extends.join(", ")}`
    return block(head, memberLines(type.properties, type.methods, opts))
  }

  if (hasMembers) {
    const body = block(`type ${type.name}${generics} =`, memberLines(type.properties, type.methods, opts))
    return type.extends.length > 0 ? `${body} & ${type.extends.join(" & ")}` : body
  }

  if (type.value) return `type ${type.name}${generics} = ${type.value}`
  if (type.extends.length > 0) return `type ${type.name}${generics} = ${type.extends.join(" & ")}`
  return type.signature.trim() || `type ${type.name}${generics}`
}

function renderConst(constant: ConstDoc): string {
  const keyword = constant.kind === "const" ? "const" : "let"
  const type = constant.type ? `: ${constant.type}` : ""
  const inline =
    constant.value && constant.value.length <= 80 && !constant.value.includes("\n")
      ? ` = ${constant.value}`
      : ""
  // A declared type already says everything; the literal is only worth it when short.
  return `${keyword} ${constant.name}${type}${inline}`
}

export function renderDeclaration(symbol: SymbolDoc, opts: RenderOptions = {}): string {
  switch (symbol.kind) {
    case "function":
      return renderFunction(symbol)
    case "class":
      return renderClass(symbol, opts)
    case "type":
    case "interface":
    case "enum":
      return renderType(symbol, opts)
    default:
      return renderConst(symbol)
  }
}

/** Declaration plus its doc comment and any export notes. */
export function renderSymbol(
  symbol: SymbolDoc,
  opts: RenderOptions & { notes?: string[] } = {},
): string {
  const parts: string[] = []
  const comment = docComment(symbol.description)
  if (comment) parts.push(comment)
  for (const note of opts.notes ?? []) parts.push(`// ${note}`)
  parts.push(renderDeclaration(symbol, opts))
  return parts.join("\n")
}
