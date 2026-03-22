// @paladin/packages/analyze-v2/parse-file.ts

import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"
import {
  isComment,
  isJSDoc,
  isSectionComment,
  isPathComment,
  stripJSDoc,
  findJSDocNode,
  extractJSDoc,
} from "./comments"
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
  StatementBlock,
} from "./parse-file.types"

const parser = new Parser()
parser.setLanguage(TypeScript.typescript)

// ─── Helpers ───

function getText(node: Parser.SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex)
}

function lineRange(node: Parser.SyntaxNode): [number, number] {
  return [node.startPosition.row, node.endPosition.row + 1]
}

/**
 * Widen a line range to include the node's parent export_statement
 * and any leading JSDoc comment.
 */
function fullRange(node: Parser.SyntaxNode, source: string): [number, number] {
  const top = node.parent?.type === "export_statement" ? node.parent : node
  const [, end] = lineRange(top)
  let start = top.startPosition.row

  const jsdocNode = findJSDocNode(node, source)
  if (jsdocNode) {
    start = jsdocNode.startPosition.row
  }

  return [start, end]
}

// ─── Preamble ───

function parsePreamble(root: Parser.SyntaxNode, source: string): {
  preamble: Pick<FileDoc, "docstr" | "pathComment" | "shebang">
  consumed: Set<number>
} {
  const consumed = new Set<number>()
  const preamble: Pick<FileDoc, "docstr" | "pathComment" | "shebang"> = {}

  const firstLine = source.split("\n", 1)[0]
  if (firstLine.startsWith("#!")) {
    preamble.shebang = firstLine
  }

  const limit = Math.min(root.namedChildren.length, 4)
  for (let i = 0; i < limit; i++) {
    const node = root.namedChildren[i]
    if (!isComment(node)) break

    if (!preamble.pathComment && isPathComment(node, source)) {
      preamble.pathComment = getText(node, source).replace(/^\/\/\s*/, "").trim()
      consumed.add(i)
      continue
    }

    if (!preamble.docstr && isJSDoc(node, source)) {
      preamble.docstr = stripJSDoc(getText(node, source))
      consumed.add(i)
      continue
    }

    break
  }

  return { preamble, consumed }
}

// ─── Params & Return Types ───

function parseParams(node: Parser.SyntaxNode | null, source: string): Param[] {
  if (!node) return []
  return node.namedChildren
    .filter(
      c => c.type === "required_parameter" || c.type === "optional_parameter"
    )
    .map(c => {
      const name = c.childForFieldName("pattern")
      const annotation = c.childForFieldName("type")
      return {
        name: name ? getText(name, source) : "",
        type: annotation
          ? getText(annotation, source).replace(/^:\s*/, "")
          : "unknown",
        optional: c.type === "optional_parameter",
      }
    })
}

function parseReturnType(node: Parser.SyntaxNode, source: string): string {
  const annotation = node.childForFieldName("return_type")
  if (annotation) return getText(annotation, source).replace(/^:\s*/, "")
  return "void"
}

// ─── Exported check ───

function isExported(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === "export_statement"
}

// ─── Symbol Parsers ───

function parseFunction(
  node: Parser.SyntaxNode,
  source: string
): FunctionDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null
  const params = node.childForFieldName("parameters")
  return {
    name: getText(name, source),
    kind: "function",
    docstr: extractJSDoc(node, source),
    exported: isExported(node),
    lineRange: fullRange(node, source),
    params: parseParams(params, source),
    returns: parseReturnType(node, source),
    async: node.children.some(c => c.type === "async"),
  }
}

function parseMethod(node: Parser.SyntaxNode, source: string): MethodDoc {
  const name = node.childForFieldName("name")
  const params = node.childForFieldName("parameters")
  const accessibility = node.children.find(c =>
    ["public", "private", "protected"].includes(c.type)
  )
  return {
    name: name ? getText(name, source) : "",
    kind: "method",
    docstr: extractJSDoc(node, source),
    lineRange: lineRange(node),
    params: parseParams(params, source),
    returns: parseReturnType(node, source),
    async: node.children.some(c => c.type === "async"),
    static: node.children.some(c => c.type === "static"),
    getter: node.children.some(c => c.type === "get"),
    setter: node.children.some(c => c.type === "set"),
    visibility: (accessibility?.type as MethodDoc["visibility"]) ?? "public",
  }
}

function parseClass(
  node: Parser.SyntaxNode,
  source: string
): ClassDoc | null {
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
      if (pname) {
        properties.push({
          name: getText(pname, source),
          type: annotation
            ? getText(annotation, source).replace(/^:\s*/, "")
            : "unknown",
          optional: false,
        })
      }
    }
  }

  return {
    name: getText(name, source),
    kind: "class",
    docstr: extractJSDoc(node, source),
    exported: isExported(node),
    lineRange: fullRange(node, source),
    properties,
    methods,
  }
}

function parseTypeOrInterface(
  node: Parser.SyntaxNode,
  source: string
): TypeDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null

  const kind =
    node.type === "interface_declaration"
      ? "interface"
      : node.type === "enum_declaration"
        ? "enum"
        : "type"

  const properties: Param[] = []
  const body = node.childForFieldName("body")

  if (body) {
    for (const child of body.namedChildren) {
      if (child.type === "property_signature") {
        const pname = child.childForFieldName("name")
        const annotation = child.childForFieldName("type")
        if (pname) {
          properties.push({
            name: getText(pname, source),
            type: annotation
              ? getText(annotation, source).replace(/^:\s*/, "")
              : "unknown",
            optional: child.children.some(c => c.type === "?"),
            docstr: extractJSDoc(child, source) || undefined,
          })
        }
      } else if (child.type === "property_identifier") {
        properties.push({
          name: getText(child, source),
          type: "",
          optional: false,
        })
      }
    }
  }

  return {
    name: getText(name, source),
    kind,
    docstr: extractJSDoc(node, source),
    exported: isExported(node),
    lineRange: fullRange(node, source),
    properties,
    signature:
      kind === "type"
        ? getText(node, source).replace(/^export\s+/, "")
        : undefined,
  }
}

function parseConst(
  node: Parser.SyntaxNode,
  source: string
): ConstDoc | null {
  const declarations = node.namedChildren.filter(
    c => c.type === "variable_declarator"
  )
  if (!declarations.length) return null
  const decl = declarations[0]
  const name = decl.childForFieldName("name")
  if (!name) return null
  const annotation = decl.childForFieldName("type")
  const value = decl.childForFieldName("value")

  return {
    name: getText(name, source),
    kind: node.children.some(c => c.type === "const") ? "const" : "variable",
    docstr: extractJSDoc(node, source),
    exported: isExported(node),
    lineRange: fullRange(node, source),
    type: annotation
      ? getText(annotation, source).replace(/^:\s*/, "")
      : "unknown",
    value: value ? getText(value, source) : undefined,
  }
}

// ─── Imports ───

function parseImports(
  root: Parser.SyntaxNode,
  source: string
): ImportRef[] {
  return root.namedChildren
    .filter(c => c.type === "import_statement")
    .map(node => {
      const src = node.childForFieldName("source")
      const clause = node.children.find(c => c.type === "import_clause")
      const named = clause?.namedChildren.find(
        c => c.type === "named_imports"
      )
      const symbols =
        named?.namedChildren
          .filter(c => c.type === "import_specifier")
          .map(c => {
            const alias = c.childForFieldName("alias")
            const name = c.childForFieldName("name")
            return alias
              ? getText(alias, source)
              : name
                ? getText(name, source)
                : ""
          })
          .filter(Boolean) ?? []

      const defaultImport = clause?.namedChildren.find(
        c => c.type === "identifier"
      )
      if (defaultImport) {
        symbols.unshift(getText(defaultImport, source))
      }

      const namespace = clause?.namedChildren.find(
        c => c.type === "namespace_import"
      )
      if (namespace) {
        const alias = namespace.childForFieldName("alias")
          ?? namespace.namedChildren.find(c => c.type === "identifier")
        if (alias) symbols.unshift(`* as ${getText(alias, source)}`)
      }

      return {
        symbols,
        source: src ? getText(src, source).replace(/['"]/g, "") : "",
      }
    })
}

// ─── Declarations we recognize ───

const DECLARATION_TYPES = new Set([
  "function_declaration",
  "class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "lexical_declaration",
  "import_statement",
  "export_statement",
])

// ─── Main ───

export function parseFile(source: string): FileDoc {
  const tree = parser.parse(source)
  const root = tree.rootNode
  const symbols: SymbolDoc[] = []
  const statements: StatementBlock[] = []

  const { preamble, consumed } = parsePreamble(root, source)

  for (let i = 0; i < root.namedChildren.length; i++) {
    if (consumed.has(i)) continue

    const node = root.namedChildren[i]

    if (isSectionComment(node, source)) continue
    if (isComment(node)) continue
    if (node.type === "import_statement") continue

    const target =
      node.type === "export_statement" ? node.namedChildren[0] : node

    if (!target) continue

    let parsed: SymbolDoc | null = null

    switch (target.type) {
      case "function_declaration":
        parsed = parseFunction(target, source)
        break
      case "class_declaration":
        parsed = parseClass(target, source)
        break
      case "interface_declaration":
      case "type_alias_declaration":
      case "enum_declaration":
        parsed = parseTypeOrInterface(target, source)
        break
      case "lexical_declaration":
        parsed = parseConst(target, source)
        break
    }

    if (parsed) {
      symbols.push(parsed)
    } else if (!DECLARATION_TYPES.has(node.type)) {
      statements.push({
        source: getText(node, source),
        lineRange: lineRange(node),
      })
    }
  }

  return {
    ...preamble,
    imports: parseImports(root, source),
    symbols,
    statements,
  }
}
