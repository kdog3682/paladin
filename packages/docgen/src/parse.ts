import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"
import { readFile } from "fs/promises"
import { fcache } from "@paladin/fcache"
import type {
  FileDoc,
  SymbolDoc,
  FunctionDoc,
  ClassDoc,
  TypeDoc,
  ConstDoc,
  MethodDoc,
  Param,
  ImportRef,
  ImportType,
  ExportKind,
} from "./parse.types"

const parser = new Parser()
parser.setLanguage(TypeScript.typescript)

function getText(node: Parser.SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex)
}

function cleanComment(raw: string): string {
  if (raw.startsWith("/*")) {
    return raw
      .replace(/^\/\*\*?/, "")
      .replace(/\*\/$/, "")
      .replace(/^[ \t]*\*?[ \t]?/gm, "")
      .trim()
  }
  return raw.replace(/^\/\/\s?/, "").trim()
}

// Collects every comment directly above a node, walking upward until it meets
// something that isn't a comment.
function collectComments(node: Parser.SyntaxNode, source: string): string {
  const lines: string[] = []
  let prev = node.previousNamedSibling
  while (prev && prev.type === "comment") {
    lines.unshift(cleanComment(getText(prev, source)))
    prev = prev.previousNamedSibling
  }
  return lines.join("\n").trim()
}

function getExportKind(node: Parser.SyntaxNode, source: string): ExportKind | undefined {
  const parent = node.parent
  if (parent?.type !== "export_statement") return undefined
  return /^export\s+default\b/.test(getText(parent, source)) ? "default" : "named"
}

// Anchors a symbol to its export_statement so comments above `export` are found.
function docAnchor(node: Parser.SyntaxNode): Parser.SyntaxNode {
  return node.parent?.type === "export_statement" ? node.parent : node
}

function parseReturnType(node: Parser.SyntaxNode, source: string): string {
  const annotation = node.childForFieldName("return_type")
  if (annotation) return getText(annotation, source).replace(/^:\s*/, "")
  return "void"
}

// Flattens `{ a = 1, b, c: d = 2 }` into individual params, capturing defaults.
function parseObjectPattern(pattern: Parser.SyntaxNode, source: string): Param[] {
  const params: Param[] = []

  for (const child of pattern.namedChildren) {
    if (child.type === "shorthand_property_identifier_pattern") {
      params.push({ name: getText(child, source), type: "unknown", optional: false })
    } else if (child.type === "object_assignment_pattern") {
      const left = child.childForFieldName("left") ?? child.namedChildren[0]
      const right = child.childForFieldName("right") ?? child.namedChildren[1]
      params.push({
        name: left ? getText(left, source) : "",
        type: "unknown",
        optional: true,
        default: right ? getText(right, source) : undefined,
      })
    } else if (child.type === "pair_pattern") {
      const key = child.childForFieldName("key")
      const value = child.childForFieldName("value")
      const hasDefault = value?.type === "assignment_pattern"
      const right = hasDefault
        ? value.childForFieldName("right") ?? value.namedChildren[1]
        : null
      params.push({
        name: key ? getText(key, source) : "",
        type: "unknown",
        optional: hasDefault,
        default: right ? getText(right, source) : undefined,
      })
    }
  }

  return params
}

// Finds `const { a = 1 } = paramName` in a body and returns the destructured params.
function bodyDestructuredParams(
  owner: Parser.SyntaxNode,
  source: string,
  paramName: string,
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
        return parseObjectPattern(name, source)
      }
    }
  }

  return null
}

function parseParams(
  node: Parser.SyntaxNode | null,
  source: string,
  owner?: Parser.SyntaxNode,
): Param[] {
  if (!node) return []

  const params: Param[] = []

  for (const c of node.namedChildren) {
    if (c.type !== "required_parameter" && c.type !== "optional_parameter") continue

    const pattern = c.childForFieldName("pattern")
    const annotation = c.childForFieldName("type")
    const value = c.childForFieldName("value")

    if (pattern?.type === "object_pattern") {
      params.push(...parseObjectPattern(pattern, source))
      continue
    }

    const name = pattern ? getText(pattern, source) : ""

    const destructured = owner ? bodyDestructuredParams(owner, source, name) : null
    if (destructured) {
      params.push(...destructured)
      continue
    }

    params.push({
      name,
      type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
      optional: c.type === "optional_parameter",
      default: value ? getText(value, source) : undefined,
    })
  }

  return params
}

function parseFunction(node: Parser.SyntaxNode, source: string): FunctionDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null
  const params = node.childForFieldName("parameters")

  return {
    name: getText(name, source),
    kind: "function",
    description: collectComments(docAnchor(node), source),
    exportKind: getExportKind(node, source),
    params: parseParams(params, source, node),
    returns: parseReturnType(node, source),
    async: node.children.some(c => c.type === "async"),
  }
}

function parseMethod(node: Parser.SyntaxNode, source: string): MethodDoc {
  const name = node.childForFieldName("name")
  const params = node.childForFieldName("parameters")
  const accessibility = node.children.find(c =>
    ["public", "private", "protected"].includes(c.type),
  )

  return {
    name: name ? getText(name, source) : "",
    kind: "method",
    description: collectComments(node, source),
    params: parseParams(params, source, node),
    returns: parseReturnType(node, source),
    async: node.children.some(c => c.type === "async"),
    static: node.children.some(c => c.type === "static"),
    getter: node.children.some(c => c.type === "get"),
    setter: node.children.some(c => c.type === "set"),
    visibility: (accessibility?.type as MethodDoc["visibility"]) ?? "public",
  }
}

function parseClass(node: Parser.SyntaxNode, source: string): ClassDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null
  const body = node.childForFieldName("body")
  const methods: MethodDoc[] = []
  const properties: Param[] = []

  for (const child of body?.namedChildren ?? []) {
    if (child.type === "method_definition") {
      methods.push(parseMethod(child, source))
    } else if (child.type === "public_field_definition") {
      const pname = child.childForFieldName("name")
      const annotation = child.childForFieldName("type")
      const value = child.childForFieldName("value")
      if (pname) {
        const description = collectComments(child, source)
        properties.push({
          name: getText(pname, source),
          type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
          optional: child.children.some(c => c.type === "?"),
          default: value ? getText(value, source) : undefined,
          description: description || undefined,
        })
      }
    }
  }

  return {
    name: getText(name, source),
    kind: "class",
    description: collectComments(docAnchor(node), source),
    exportKind: getExportKind(node, source),
    properties,
    methods,
  }
}

function parseTypeOrInterface(node: Parser.SyntaxNode, source: string): TypeDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null

  const kind =
    node.type === "interface_declaration" ? "interface"
    : node.type === "enum_declaration" ? "enum"
    : "type"

  let body: Parser.SyntaxNode | null = null
  if (node.type === "type_alias_declaration") {
    const value = node.childForFieldName("value")
    body = value?.type === "object_type" ? value : null
  } else {
    body = node.childForFieldName("body")
  }

  const properties: Param[] = []

  for (const child of body?.namedChildren ?? []) {
    if (child.type === "property_signature") {
      const pname = child.childForFieldName("name")
      const annotation = child.childForFieldName("type")
      if (pname) {
        const description = collectComments(child, source)
        properties.push({
          name: getText(pname, source),
          type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
          optional: child.children.some(c => c.type === "?"),
          description: description || undefined,
        })
      }
    } else if (child.type === "property_identifier" || child.type === "enum_assignment") {
      const key = child.type === "enum_assignment" ? child.childForFieldName("name") : child
      const value = child.type === "enum_assignment" ? child.childForFieldName("value") : null
      const description = collectComments(child, source)
      properties.push({
        name: key ? getText(key, source) : "",
        type: "",
        optional: false,
        default: value ? getText(value, source) : undefined,
        description: description || undefined,
      })
    }
  }

  return {
    name: getText(name, source),
    kind,
    description: collectComments(docAnchor(node), source),
    exportKind: getExportKind(node, source),
    properties,
    signature: kind === "type" ? getText(node, source).replace(/^export\s+/, "") : undefined,
  }
}

function parseConst(node: Parser.SyntaxNode, source: string): ConstDoc | null {
  const declarations = node.namedChildren.filter(c => c.type === "variable_declarator")
  if (!declarations.length) return null
  const decl = declarations[0]
  const name = decl.childForFieldName("name")
  if (!name) return null
  const annotation = decl.childForFieldName("type")
  const value = decl.childForFieldName("value")

  return {
    name: getText(name, source),
    kind: node.children.some(c => c.type === "const") ? "const" : "variable",
    description: collectComments(docAnchor(node), source),
    exportKind: getExportKind(node, source),
    type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
    value: value ? getText(value, source) : undefined,
  }
}

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "crypto", "dgram", "dns", "events", "fs", "http", "http2", "https", "net",
  "os", "path", "perf_hooks", "process", "querystring", "readline", "stream",
  "string_decoder", "timers", "tls", "tty", "url", "util", "v8", "vm",
  "worker_threads", "zlib",
])

function importType(specifier: string): ImportType {
  if (specifier.startsWith(".")) return "relative"
  const bare = specifier.startsWith("node:") ? specifier.slice(5) : specifier
  const root = bare.split("/")[0]
  if (specifier.startsWith("node:") || NODE_BUILTINS.has(root)) return "builtin"
  if (specifier.startsWith("@paladin/")) return "workspace"
  return "external"
}

function parseImports(root: Parser.SyntaxNode, source: string): ImportRef[] {
  const imports: ImportRef[] = []

  for (const node of root.namedChildren) {
    if (node.type !== "import_statement") continue

    const src = node.childForFieldName("source")
    const clause = node.children.find(c => c.type === "import_clause")
    const named = clause?.namedChildren.find(c => c.type === "named_imports")

    const symbols =
      named?.namedChildren
        .filter(c => c.type === "import_specifier")
        .map(c => {
          const alias = c.childForFieldName("alias")
          const name = c.childForFieldName("name")
          return alias ? getText(alias, source) : name ? getText(name, source) : ""
        })
        .filter(Boolean) ?? []

    const specifier = src ? getText(src, source).replace(/['"]/g, "") : ""

    imports.push({ symbols, source: specifier, type: importType(specifier) })
  }

  return imports
}

export function parseSource(source: string, path: string): FileDoc {
  const tree = parser.parse(source)
  const root = tree.rootNode

  const symbols: SymbolDoc[] = []

  function visit(node: Parser.SyntaxNode): void {
    const target = node.type === "export_statement" ? node.namedChildren[0] : node

    if (target) {
      switch (target.type) {
        case "function_declaration": {
          const doc = parseFunction(target, source)
          if (doc) symbols.push(doc)
          return
        }

        case "class_declaration": {
          const doc = parseClass(target, source)
          if (doc) symbols.push(doc)
          return
        }

        case "interface_declaration":
        case "type_alias_declaration":
        case "enum_declaration": {
          const doc = parseTypeOrInterface(target, source)
          if (doc) symbols.push(doc)
          return
        }

        case "lexical_declaration": {
          const doc = parseConst(target, source)
          if (doc) symbols.push(doc)
          return
        }
      }
    }

    for (const child of node.namedChildren) {
      visit(child)
    }
  }

  visit(root)

  return {
    path,
    imports: parseImports(root, source),
    symbols,
  }
}

async function parseImpl(path: string): Promise<FileDoc> {
  const source = await readFile(path, "utf8")
  return parseSource(source, path)
}

export const parse = fcache(parseImpl)
