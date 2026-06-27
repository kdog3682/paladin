// @paladin/packages/codeform/documenter.ts

import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"
import { readFile } from "fs/promises"
import { relative, dirname, join } from "path"
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
  DirectoryDoc,
  SymbolRef,
} from "./documenter.types"

const parser = new Parser()
parser.setLanguage(TypeScript.typescript)

function getText(node: Parser.SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex)
}

function getJSDoc(node: Parser.SyntaxNode, source: string): string {
  const prev = node.previousNamedSibling
  if (prev?.type === "comment" && getText(prev, source).startsWith("/**")) {
    return getText(prev, source)
      .replace(/^\/\*\*\s*/, "")
      .replace(/\s*\*\/$/, "")
      .replace(/^\s*\* ?/gm, "")
      .trim()
  }
  return ""
}

function parseParams(node: Parser.SyntaxNode | null, source: string): Param[] {
  if (!node) return []
  return node.namedChildren
    .filter(c => c.type === "required_parameter" || c.type === "optional_parameter")
    .map(c => {
      const name = c.childForFieldName("pattern")
      const annotation = c.childForFieldName("type")
      return {
        name: name ? getText(name, source) : "",
        type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
        optional: c.type === "optional_parameter",
      }
    })
}

function parseReturnType(node: Parser.SyntaxNode, source: string): string {
  const annotation = node.childForFieldName("return_type")
  if (annotation) return getText(annotation, source).replace(/^:\s*/, "")
  return "void"
}

function isExported(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === "export_statement"
}

function parseFunction(node: Parser.SyntaxNode, source: string): FunctionDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null
  const params = node.childForFieldName("parameters")
  return {
    name: getText(name, source),
    kind: "function",
    description: getJSDoc(node.parent?.type === "export_statement" ? node.parent : node, source),
    exported: isExported(node),
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
    description: getJSDoc(node, source),
    params: parseParams(params, source),
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
      if (pname) {
        properties.push({
          name: getText(pname, source),
          type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
          optional: false,
        })
      }
    }
  }

  return {
    name: getText(name, source),
    kind: "class",
    description: getJSDoc(node.parent?.type === "export_statement" ? node.parent : node, source),
    exported: isExported(node),
    properties,
    methods,
  }
}

function parseTypeOrInterface(node: Parser.SyntaxNode, source: string): TypeDoc | null {
  const name = node.childForFieldName("name")
  if (!name) return null
  const kind = node.type === "interface_declaration" ? "interface"
    : node.type === "enum_declaration" ? "enum"
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
            type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
            optional: child.children.some(c => c.type === "?"),
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

  const target = node.parent?.type === "export_statement" ? node.parent : node
  return {
    name: getText(name, source),
    kind,
    description: getJSDoc(target, source),
    exported: isExported(node),
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
    description: getJSDoc(node.parent?.type === "export_statement" ? node.parent : node, source),
    exported: isExported(node),
    type: annotation ? getText(annotation, source).replace(/^:\s*/, "") : "unknown",
    value: value ? getText(value, source) : undefined,
  }
}

function parseImports(root: Parser.SyntaxNode, source: string): ImportRef[] {
  return root.namedChildren
    .filter(c => c.type === "import_statement")
    .map(node => {
      const src = node.childForFieldName("source")
      const clause = node.children.find(c => c.type === "import_clause")
      const named = clause?.namedChildren.find(c => c.type === "named_imports")
      const symbols = named?.namedChildren
        .filter(c => c.type === "import_specifier")
        .map(c => {
          const alias = c.childForFieldName("alias")
          const name = c.childForFieldName("name")
          return alias ? getText(alias, source) : name ? getText(name, source) : ""
        })
        .filter(Boolean) ?? []

      return {
        symbols,
        source: src ? getText(src, source).replace(/['"]/g, "") : "",
      }
    })
}

function resolveImports(file: FileDoc, allPaths: string[]) {
  for (const imp of file.imports) {
    if (!imp.source.startsWith(".")) continue
    const dir = dirname(file.path)
    const rel = join(dir, imp.source).replace(/\\/g, "/")
    const match = allPaths.find(p =>
      p === rel + ".ts" || p === rel + ".tsx" || p === rel + "/index.ts" || p === rel + "/index.tsx"
    )
    if (match) imp.resolved = match
  }
}

function parseFile(source: string, path: string): FileDoc {
  const tree = parser.parse(source)
  const root = tree.rootNode
  const symbols: SymbolDoc[] = []

  function walk(node: Parser.SyntaxNode) {
    const target = node.type === "export_statement"
      ? node.namedChildren[0]
      : node

    if (!target) return

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

    for (const child of node.namedChildren) {
      walk(child)
    }
  }

  walk(root)

  return {
    path,
    imports: parseImports(root, source),
    symbols,
  }
}

function buildIndex(files: FileDoc[]): Record<string, SymbolRef> {
  const index: Record<string, SymbolRef> = {}
  for (const file of files) {
    for (const sym of file.symbols) {
      if (sym.exported) {
        index[sym.name] = { file: file.path, kind: sym.kind }
      }
    }
  }
  return index
}

async function parseFileCached(filepath: string): Promise<FileDoc> {
  const source = await readFile(filepath, "utf-8")
  return parseFile(source, filepath)
}

const cachedParse = fcache(parseFileCached)

export async function document(root: string, files: string[]): Promise<DirectoryDoc> {
  const docs = await Promise.all(
    files.map(async filepath => {
      const doc = await cachedParse(filepath)
      return { ...doc, path: relative(root, filepath) }
    })
  )

  const allPaths = docs.map(d => d.path)
  for (const doc of docs) {
    resolveImports(doc, allPaths)
  }

  return {
    root,
    files: docs,
    index: buildIndex(docs),
    generated: Date.now(),
  }
}
