import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"
import { readFile } from "fs/promises"
import { fcache } from "@paladin/fcache"
import type {
  ClassDoc,
  ConstDoc,
  ExportKind,
  FileDoc,
  FunctionDoc,
  ImportBinding,
  ImportRef,
  ImportType,
  Loc,
  MethodDoc,
  Param,
  ReExport,
  ReExportBinding,
  SymbolDoc,
  TypeDoc,
  Visibility,
} from "./parse.types"

const parser = new Parser()
parser.setLanguage(TypeScript.typescript)

type Node = Parser.SyntaxNode

/* ------------------------------------------------------------------ text */

function getText(node: Node, source: string): string {
  return source.slice(node.startIndex, node.endIndex)
}

function unquote(text: string): string {
  return text.replace(/^['"`]/, "").replace(/['"`]$/, "")
}

function stripAnnotation(text: string): string {
  return text.replace(/^\s*[?:]\s*/, "").trim()
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function locOf(node: Node): Loc {
  return {
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column + 1,
  }
}

function annotationOf(node: Node, source: string): string | undefined {
  const annotation = node.childForFieldName("type")
  return annotation ? stripAnnotation(getText(annotation, source)) : undefined
}

function hasChild(node: Node, type: string): boolean {
  return node.children.some(c => c.type === type)
}

function typeParamsOf(node: Node, source: string): string[] {
  const params = node.childForFieldName("type_parameters")
  if (!params) return []
  return params.namedChildren.map(c => oneLine(getText(c, source))).filter(Boolean)
}

/* -------------------------------------------------------------- comments */

const DIRECTIVE =
  /^(eslint\b|@ts-|prettier-|biome-|c8 |v8 |istanbul |#!|#?region\b|#?endregion\b)/i

function cleanComment(raw: string): string {
  if (raw.startsWith("/*")) {
    return raw
      .replace(/^\/\*\*?/, "")
      .replace(/\*\/$/, "")
      .replace(/^[ \t]*\*?[ \t]?/gm, "")
      .trim()
  }
  return raw.replace(/^\/\/+[ \t]?/, "").trimEnd()
}

// Collects the comment block directly above a node. Stops at a blank line, at a
// trailing comment that belongs to the previous line of code, and at anything
// that isn't a comment. Tooling directives are stepped over, not absorbed.
function collectComments(node: Node, source: string): string {
  const parts: string[] = []
  let anchor = node
  let prev = anchor.previousNamedSibling

  while (prev && prev.type === "comment") {
    // blank line between the comment and what it would document
    if (prev.endPosition.row < anchor.startPosition.row - 1) break

    // `const a = 1 // trailing` — belongs to that line, not to us
    const before = prev.previousNamedSibling
    if (before && before.type !== "comment" && before.endPosition.row === prev.startPosition.row) {
      break
    }

    const text = cleanComment(getText(prev, source))
    if (!DIRECTIVE.test(text)) parts.unshift(text)

    anchor = prev
    prev = prev.previousNamedSibling
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

// Anchors a symbol to its export_statement so comments above `export` are found.
function docAnchor(node: Node): Node {
  return node.parent?.type === "export_statement" ? node.parent : node
}

/* ---------------------------------------------------------- signature ---- */

function trimSignature(text: string): string {
  return oneLine(text).replace(/(=>|\{|;)\s*$/, "").trim()
}

// Everything up to (but excluding) the body, collapsed onto one line.
function callableSignature(node: Node, source: string): string {
  const body = node.childForFieldName("body")
  const end = body ? body.startIndex : node.endIndex
  return trimSignature(source.slice(node.startIndex, end))
}

/* ------------------------------------------------------ type inference --- */

function inferType(node: Node | null | undefined, source: string): string {
  if (!node) return "unknown"

  switch (node.type) {
    case "number":
      return "number"
    case "string":
    case "template_string":
      return "string"
    case "true":
    case "false":
      return "boolean"
    case "null":
      return "null"
    case "regex":
      return "RegExp"
    case "array":
      return "unknown[]"
    case "object":
      return "object"
    case "arrow_function":
    case "function_expression":
      return "Function"
    case "new_expression": {
      const ctor = node.childForFieldName("constructor")
      const args = node.childForFieldName("type_arguments")
      if (!ctor) return "unknown"
      return getText(ctor, source) + (args ? getText(args, source) : "")
    }
    case "as_expression":
    case "satisfies_expression": {
      const target = node.namedChildren[1]
      return target ? oneLine(getText(target, source)) : "unknown"
    }
    case "unary_expression": {
      const operator = node.childForFieldName("operator")
      if (operator && getText(operator, source) === "!") return "boolean"
      return inferType(node.childForFieldName("argument"), source)
    }
    case "identifier":
      return getText(node, source) === "undefined" ? "undefined" : "unknown"
  }

  return "unknown"
}

/* ------------------------------------------------------------- params ---- */

type Member = { type: string; optional: boolean; description?: string }

// Maps `{ a?: number; b: string }` in a parameter annotation onto its members so
// destructured names can be typed.
function objectTypeMembers(node: Node | null, source: string): Map<string, Member> {
  const members = new Map<string, Member>()
  const annotation = node?.childForFieldName("type")
  const object = annotation?.namedChildren.find(c => c.type === "object_type")
  if (!object) return members

  for (const member of object.namedChildren) {
    if (member.type !== "property_signature") continue
    const name = member.childForFieldName("name")
    if (!name) continue
    members.set(getText(name, source), {
      type: annotationOf(member, source) ?? "unknown",
      optional: hasChild(member, "?"),
      description: collectComments(member, source) || undefined,
    })
  }

  return members
}

// Flattens `{ a = 1, b, c: d = 2, ...rest }` into individual params.
function parseObjectPattern(
  pattern: Node,
  source: string,
  members: Map<string, Member>,
): Param[] {
  const params: Param[] = []

  const add = (name: string, defaultNode: Node | null, declared?: string): void => {
    const member = members.get(name)
    const param: Param = {
      name,
      type: member?.type ?? declared ?? inferType(defaultNode, source),
      optional: member?.optional ?? false,
    }
    if (defaultNode) param.default = oneLine(getText(defaultNode, source))
    if (member?.description) param.description = member.description
    params.push(param)
  }

  for (const child of pattern.namedChildren) {
    if (child.type === "shorthand_property_identifier_pattern") {
      add(getText(child, source), null)
      continue
    }

    if (child.type === "object_assignment_pattern") {
      const left = child.childForFieldName("left") ?? child.namedChildren[0]
      const right = child.childForFieldName("right") ?? child.namedChildren[1]
      add(left ? getText(left, source) : "", right ?? null)
      continue
    }

    if (child.type === "pair_pattern") {
      const key = child.childForFieldName("key")
      const value = child.childForFieldName("value")
      const right =
        value?.type === "assignment_pattern"
          ? value.childForFieldName("right") ?? value.namedChildren[1]
          : null
      add(key ? getText(key, source) : "", right ?? null)
      continue
    }

    if (child.type === "rest_pattern") {
      const name = child.namedChildren[0]
      params.push({
        name: name ? getText(name, source) : "rest",
        type: "unknown",
        optional: false,
        rest: true,
      })
    }
  }

  return params
}

// Finds `const { a = 1 } = paramName` in a body and returns the destructured params.
function bodyDestructuredParams(
  owner: Node,
  source: string,
  paramName: string,
  members: Map<string, Member>,
): Param[] | null {
  const body = owner.childForFieldName("body")
  if (!body || body.type !== "statement_block") return null

  for (const stmt of body.namedChildren) {
    if (stmt.type !== "lexical_declaration" && stmt.type !== "variable_declaration") continue

    for (const decl of stmt.namedChildren) {
      if (decl.type !== "variable_declarator") continue
      const name = decl.childForFieldName("name")
      const value = decl.childForFieldName("value")
      if (
        name?.type === "object_pattern" &&
        value?.type === "identifier" &&
        getText(value, source) === paramName
      ) {
        return parseObjectPattern(name, source, members)
      }
    }
  }

  return null
}

function paramModifiers(node: Node, source: string): Partial<Param> {
  const accessibility = node.children.find(c => c.type === "accessibility_modifier")
  const out: Partial<Param> = {}
  if (accessibility) out.visibility = getText(accessibility, source) as Visibility
  if (hasChild(node, "readonly")) out.readonly = true
  return out
}

function parseParams(node: Node | null, source: string, owner?: Node): Param[] {
  if (!node) return []

  // arrow functions may declare a single bare identifier parameter
  if (node.type !== "formal_parameters") {
    return [{ name: getText(node, source), type: "unknown", optional: false }]
  }

  const params: Param[] = []

  for (const child of node.namedChildren) {
    if (
      child.type !== "required_parameter" &&
      child.type !== "optional_parameter" &&
      child.type !== "rest_parameter"
    ) {
      continue
    }

    const pattern = child.childForFieldName("pattern")
    const value = child.childForFieldName("value")
    const declared = annotationOf(child, source)
    const members = objectTypeMembers(child, source)

    if (pattern?.type === "object_pattern") {
      params.push(...parseObjectPattern(pattern, source, members))
      continue
    }

    if (pattern?.type === "rest_pattern" || child.type === "rest_parameter") {
      const inner = pattern?.namedChildren[0] ?? pattern
      params.push({
        name: inner ? getText(inner, source) : "",
        type: declared ?? "unknown",
        optional: false,
        rest: true,
      })
      continue
    }

    const name = pattern ? getText(pattern, source) : ""

    const destructured = owner
      ? bodyDestructuredParams(owner, source, name, members)
      : null
    if (destructured) {
      params.push(...destructured)
      continue
    }

    params.push({
      name,
      type: declared ?? inferType(value, source),
      optional: child.type === "optional_parameter" || hasChild(child, "?"),
      default: value ? oneLine(getText(value, source)) : undefined,
      ...paramModifiers(child, source),
    })
  }

  return params
}

function parseReturnType(node: Node, source: string): string {
  const annotation = node.childForFieldName("return_type")
  if (annotation) return stripAnnotation(getText(annotation, source))
  return "void"
}

/* ---------------------------------------------------------- functions --- */

function parseFunction(node: Node, source: string): FunctionDoc | null {
  const name = node.childForFieldName("name")
  const anchor = docAnchor(node)

  return {
    name: name ? getText(name, source) : "default",
    kind: "function",
    description: collectComments(anchor, source),
    exportKind: "none",
    typeParams: typeParamsOf(node, source),
    signature: callableSignature(node, source),
    loc: locOf(node),
    params: parseParams(node.childForFieldName("parameters"), source, node),
    returns: parseReturnType(node, source),
    async: hasChild(node, "async"),
    generator: hasChild(node, "*") || node.type === "generator_function_declaration",
    overloads: [],
  }
}

/* ------------------------------------------------------------ methods --- */

function visibilityOf(node: Node, source: string, name: Node | null): Visibility {
  const accessibility = node.children.find(c => c.type === "accessibility_modifier")
  if (accessibility) return getText(accessibility, source) as Visibility
  if (name?.type === "private_property_identifier") return "private"
  return "public"
}

function parseMethod(node: Node, source: string): MethodDoc {
  const name = node.childForFieldName("name")

  return {
    name: name ? getText(name, source) : "",
    kind: "method",
    description: collectComments(node, source),
    typeParams: typeParamsOf(node, source),
    params: parseParams(node.childForFieldName("parameters"), source, node),
    returns: parseReturnType(node, source),
    async: hasChild(node, "async"),
    static: hasChild(node, "static"),
    abstract: hasChild(node, "abstract") || node.type === "abstract_method_signature",
    optional: hasChild(node, "?"),
    getter: hasChild(node, "get"),
    setter: hasChild(node, "set"),
    visibility: visibilityOf(node, source, name),
    signature: callableSignature(node, source),
    loc: locOf(node),
  }
}

/* ------------------------------------------------------------ classes --- */

function heritage(node: Node, source: string, keyword: string): string[] {
  const clause = node.namedChildren.find(c => c.type === "class_heritage")
  const targets = clause ? clause.namedChildren : node.namedChildren
  const match = targets.find(c => getText(c, source).trimStart().startsWith(keyword))
  if (!match) return []
  return oneLine(getText(match, source))
    .replace(new RegExp(`^${keyword}\\s*`), "")
    .split(/\s*,\s*/)
    .filter(Boolean)
}

function parseClass(node: Node, source: string): ClassDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null

  const body = node.childForFieldName("body")
  const methods: MethodDoc[] = []
  const properties: Param[] = []

  for (const child of body?.namedChildren ?? []) {
    if (child.type === "method_definition" || child.type === "abstract_method_signature") {
      const method = parseMethod(child, source)
      methods.push(method)

      // constructor parameter properties become class properties
      if (method.name === "constructor") {
        for (const param of method.params) {
          if (!param.visibility && !param.readonly) continue
          properties.push({ ...param, description: param.description })
        }
      }
      continue
    }

    if (child.type === "public_field_definition" || child.type === "property_signature") {
      const pname = child.childForFieldName("name")
      if (!pname) continue
      const value = child.childForFieldName("value")
      const description = collectComments(child, source)
      properties.push({
        name: getText(pname, source),
        type: annotationOf(child, source) ?? inferType(value, source),
        optional: hasChild(child, "?"),
        default: value ? oneLine(getText(value, source)) : undefined,
        static: hasChild(child, "static") || undefined,
        readonly: hasChild(child, "readonly") || undefined,
        abstract: hasChild(child, "abstract") || undefined,
        visibility: visibilityOf(child, source, pname),
        description: description || undefined,
      })
    }
  }

  const extendsList = heritage(node, source, "extends")
  const implementsList = heritage(node, source, "implements")

  return {
    name: getText(name, source),
    kind: "class",
    description: collectComments(docAnchor(node), source),
    exportKind: "none",
    typeParams: typeParamsOf(node, source),
    signature: callableSignature(node, source),
    loc: locOf(node),
    abstract: node.type === "abstract_class_declaration" || hasChild(node, "abstract"),
    extends: extendsList[0],
    implements: implementsList,
    properties,
    methods,
  }
}

/* ------------------------------------------ types, interfaces, enums ---- */

function parseTypeOrInterface(node: Node, source: string): TypeDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null

  const kind: TypeDoc["kind"] =
    node.type === "interface_declaration" ? "interface"
    : node.type === "enum_declaration" ? "enum"
    : "type"

  const value = node.childForFieldName("value")
  let body: Node | null = null
  if (kind === "type") {
    body = value?.type === "object_type" ? value : null
  } else {
    body = node.childForFieldName("body")
  }

  const properties: Param[] = []
  const methods: MethodDoc[] = []

  for (const child of body?.namedChildren ?? []) {
    if (child.type === "method_signature") {
      methods.push(parseMethod(child, source))
      continue
    }

    if (child.type === "property_signature") {
      const pname = child.childForFieldName("name")
      if (!pname) continue
      const description = collectComments(child, source)
      properties.push({
        name: getText(pname, source),
        type: annotationOf(child, source) ?? "unknown",
        optional: hasChild(child, "?"),
        readonly: hasChild(child, "readonly") || undefined,
        description: description || undefined,
      })
      continue
    }

    if (child.type === "index_signature") {
      const description = collectComments(child, source)
      properties.push({
        name: oneLine(getText(child, source)).replace(/\s*:\s*[^:]*$/, ""),
        type: annotationOf(child, source) ?? "unknown",
        optional: false,
        description: description || undefined,
      })
      continue
    }

    if (child.type === "property_identifier" || child.type === "enum_assignment") {
      const key = child.type === "enum_assignment" ? child.childForFieldName("name") : child
      const member = child.type === "enum_assignment" ? child.childForFieldName("value") : null
      const description = collectComments(child, source)
      properties.push({
        name: key ? getText(key, source) : "",
        type: member ? inferType(member, source) : "unknown",
        optional: false,
        default: member ? oneLine(getText(member, source)) : undefined,
        description: description || undefined,
      })
    }
  }

  return {
    name: getText(name, source),
    kind,
    description: collectComments(docAnchor(node), source),
    exportKind: "none",
    typeParams: typeParamsOf(node, source),
    signature: getText(node, source),
    loc: locOf(node),
    extends: heritage(node, source, "extends"),
    properties,
    methods,
    value: kind === "type" && !body && value ? oneLine(getText(value, source)) : undefined,
  }
}

/* ---------------------------------------------------------- variables --- */

function constSignature(keyword: string, name: string, type: string, value?: string): string {
  const head = `${keyword} ${name}${type && type !== "unknown" ? `: ${type}` : ""}`
  if (!value) return head
  const flat = oneLine(value)
  return `${head} = ${flat.length > 60 ? `${flat.slice(0, 57)}...` : flat}`
}

function parseVariables(node: Node, source: string): SymbolDoc[] {
  const keyword = hasChild(node, "const") ? "const" : hasChild(node, "let") ? "let" : "var"
  const description = collectComments(docAnchor(node), source)
  const out: SymbolDoc[] = []

  for (const decl of node.namedChildren) {
    if (decl.type !== "variable_declarator") continue
    const name = decl.childForFieldName("name")
    if (!name || name.type !== "identifier") continue
    const value = decl.childForFieldName("value")
    const declared = annotationOf(decl, source)

    // `const f = () => {}` documents as a function, not a constant
    if (value && (value.type === "arrow_function" || value.type === "function_expression")) {
      const body = value.childForFieldName("body")
      const end = body ? body.startIndex : value.endIndex
      out.push({
        name: getText(name, source),
        kind: "function",
        description,
        exportKind: "none",
        typeParams: typeParamsOf(value, source),
        signature: trimSignature(
          `${keyword} ${getText(name, source)} = ${source.slice(value.startIndex, end)}`,
        ),
        loc: locOf(decl),
        params: parseParams(value.childForFieldName("parameters"), source, value),
        returns: parseReturnType(value, source),
        async: hasChild(value, "async"),
        generator: hasChild(value, "*"),
        overloads: [],
      })
      continue
    }

    const type = declared ?? inferType(value, source)
    out.push({
      name: getText(name, source),
      kind: keyword === "const" ? "const" : "variable",
      description,
      exportKind: "none",
      typeParams: [],
      signature: constSignature(
        keyword,
        getText(name, source),
        type,
        value ? getText(value, source) : undefined,
      ),
      loc: locOf(decl),
      type,
      value: value ? oneLine(getText(value, source)) : undefined,
    })
  }

  return out
}

/* ------------------------------------------------------------ imports --- */

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "crypto", "dgram", "dns", "events", "fs", "http", "http2", "https", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline",
  "repl", "stream", "string_decoder", "test", "timers", "tls", "tty", "url",
  "util", "v8", "vm", "worker_threads", "zlib",
])

function importType(specifier: string): ImportType {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return "relative"
  if (specifier.startsWith("node:") || specifier.startsWith("bun:")) return "builtin"
  if (specifier.startsWith("@paladin/")) return "workspace"
  if (NODE_BUILTINS.has(specifier.split("/")[0])) return "builtin"
  return "external"
}

function parseImport(node: Node, source: string): ImportRef | null {
  const src = node.childForFieldName("source")
  if (!src) return null

  const specifier = unquote(getText(src, source))
  const typeOnly = /^import\s+type\b/.test(getText(node, source))
  const bindings: ImportBinding[] = []
  const clause = node.children.find(c => c.type === "import_clause")

  for (const child of clause?.namedChildren ?? []) {
    if (child.type === "identifier") {
      bindings.push({ name: getText(child, source), kind: "default", typeOnly })
      continue
    }

    if (child.type === "namespace_import") {
      const id = child.namedChildren.find(c => c.type === "identifier")
      bindings.push({ name: id ? getText(id, source) : "*", kind: "namespace", typeOnly })
      continue
    }

    if (child.type === "named_imports") {
      for (const spec of child.namedChildren) {
        if (spec.type !== "import_specifier") continue
        const name = spec.childForFieldName("name")
        const alias = spec.childForFieldName("alias")
        const imported = name ? getText(name, source) : ""
        bindings.push({
          name: alias ? getText(alias, source) : imported,
          imported: alias ? imported : undefined,
          kind: "named",
          typeOnly: typeOnly || /^type\s/.test(getText(spec, source)),
        })
      }
    }
  }

  return {
    source: specifier,
    type: importType(specifier),
    typeOnly,
    bindings,
    symbols: bindings.map(b => b.name),
    loc: locOf(node),
  }
}

/* ------------------------------------------------------------ exports --- */

function exportClauseBindings(node: Node, source: string): ReExportBinding[] {
  const clause = node.namedChildren.find(c => c.type === "export_clause")
  if (!clause) return []

  return clause.namedChildren
    .filter(c => c.type === "export_specifier")
    .map(spec => {
      const name = spec.childForFieldName("name")
      const alias = spec.childForFieldName("alias")
      const local = name ? getText(name, source) : ""
      return { name: local, exported: alias ? getText(alias, source) : local }
    })
    .filter(b => b.name)
}

function parseReExport(node: Node, source: string): ReExport | null {
  const src = node.childForFieldName("source")
  if (!src) return null

  const specifier = unquote(getText(src, source))
  const namespaceExport = node.namedChildren.find(c => c.type === "namespace_export")
  const namespaceId = namespaceExport?.namedChildren[0]

  return {
    source: specifier,
    type: importType(specifier),
    typeOnly: /^export\s+type\b/.test(getText(node, source)),
    star: hasChild(node, "*") || Boolean(namespaceExport),
    namespace: namespaceId ? getText(namespaceId, source) : undefined,
    bindings: exportClauseBindings(node, source),
    loc: locOf(node),
  }
}

/* -------------------------------------------------------------- parse --- */

export function parseSource(source: string, path: string): FileDoc {
  const tree = parser.parse(source)
  const root = tree.rootNode

  const symbols: SymbolDoc[] = []
  const imports: ImportRef[] = []
  const reExports: ReExport[] = []
  const deferred = new Map<string, { exported: string; kind: ExportKind }>()

  function push(doc: SymbolDoc): void {
    if (doc.kind === "function") {
      const index = symbols.findIndex(s => s.name === doc.name && s.kind === "function")
      if (index !== -1) {
        const previous = symbols[index] as FunctionDoc
        doc.overloads = [...previous.overloads, previous.signature]
        doc.description = doc.description || previous.description
        symbols[index] = doc
        return
      }
    }
    symbols.push(doc)
  }

  function parseDeclaration(node: Node, exportKind: ExportKind): void {
    const before = symbols.length

    switch (node.type) {
      case "function_declaration":
      case "generator_function_declaration":
      case "function_signature": {
        const doc = parseFunction(node, source)
        if (doc) push(doc)
        break
      }
      case "class_declaration":
      case "abstract_class_declaration": {
        const doc = parseClass(node, source)
        if (doc) push(doc)
        break
      }
      case "interface_declaration":
      case "type_alias_declaration":
      case "enum_declaration": {
        const doc = parseTypeOrInterface(node, source)
        if (doc) push(doc)
        break
      }
      case "lexical_declaration":
      case "variable_declaration": {
        for (const doc of parseVariables(node, source)) push(doc)
        break
      }
      default:
        return
    }

    if (exportKind === "none") return
    for (const doc of symbols.slice(Math.min(before, symbols.length - 1))) {
      doc.exportKind = exportKind
    }
  }

  for (const node of root.namedChildren) {
    if (node.type === "comment") continue

    if (node.type === "import_statement") {
      const ref = parseImport(node, source)
      if (ref) imports.push(ref)
      continue
    }

    if (node.type === "export_statement") {
      // `export ... from "..."`
      if (node.childForFieldName("source")) {
        const ref = parseReExport(node, source)
        if (ref) reExports.push(ref)
        continue
      }

      // `export { a, b as c }` / `export type { A }`
      const clause = exportClauseBindings(node, source)
      if (clause.length) {
        for (const binding of clause) {
          deferred.set(binding.name, {
            exported: binding.exported,
            kind: binding.exported === "default" ? "default" : "named",
          })
        }
        continue
      }

      const isDefault = /^export\s+default\b/.test(getText(node, source))
      const declaration =
        node.childForFieldName("declaration") ??
        node.childForFieldName("value") ??
        node.namedChildren.find(c => c.type !== "comment")

      if (!declaration) continue

      // `export default someIdentifier`
      if (declaration.type === "identifier") {
        deferred.set(getText(declaration, source), { exported: "default", kind: "default" })
        continue
      }

      parseDeclaration(declaration, isDefault ? "default" : "named")
      continue
    }

    parseDeclaration(node, "none")
  }

  for (const doc of symbols) {
    const entry = deferred.get(doc.name)
    if (!entry) continue
    doc.exportKind = entry.kind
    if (entry.exported !== doc.name) doc.exportedAs = entry.exported
  }

  return { path, imports, reExports, symbols }
}

async function parseImpl(path: string): Promise<FileDoc> {
  const source = await readFile(path, "utf8")
  return parseSource(source, path)
}

export const parse = fcache(parseImpl)
