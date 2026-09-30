import { resolve } from "node:path"
import { Node, SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { createProject, packageRootOf } from "../project"
import { findDeclaration } from "../utils/declarations"
import { isMemberName } from "../utils/nodes"
import { contains } from "../utils/references"

export type TypeRef = {
  name: string
  text: string
  file: string
  line: number
}

export type Reference = {
  file: string
  line: number
  /** the line of source containing the reference */
  text: string
  /** enclosing top-level symbol, when there is one */
  symbol?: string
}

export type SymbolDetail = {
  types: TypeRef[]
  references: Reference[]
}

const MAX_TYPE_TEXT = 2000

/**
 * The types a symbol mentions and the places that use it, both scoped to the package the file
 * belongs to. Types from node_modules and .d.ts files are left out: they are rarely what you are
 * reading a local symbol for.
 */
export function symbolDetail(file: string, name: string): SymbolDetail {
  const path = resolve(file)
  const project = createProject(packageRootOf(path))
  const declaration = findDeclaration(project, name, path)

  return { types: typesOf(declaration), references: referencesTo(declaration) }
}

function typesOf(declaration: Node): TypeRef[] {
  const found = new Map<string, TypeRef>()

  for (const id of declaration.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (isMemberName(id)) continue

    const symbol = id.getSymbol()
    const declarations = [...(symbol?.getDeclarations() ?? []), ...(symbol?.getAliasedSymbol()?.getDeclarations() ?? [])]

    for (const node of declarations) {
      if (!isTypeDeclaration(node)) continue
      if (contains(declaration, node)) continue

      const source = node.getSourceFile()
      if (source.isInNodeModules() || source.isDeclarationFile()) continue

      const line = node.getStartLineNumber()
      const key = `${source.getFilePath()}:${line}`
      if (found.has(key)) continue

      found.set(key, { name: node.getName(), text: truncate(node.getText()), file: source.getFilePath(), line })
    }
  }

  return [...found.values()]
}

function referencesTo(declaration: Node): Reference[] {
  const name = nameNodeOf(declaration)
  if (!name || !Node.isReferenceFindable(name)) return []

  const lines = new Map<SourceFile, string[]>()
  const found: Reference[] = []

  for (const node of name.findReferencesAsNodes()) {
    if (contains(declaration, node)) continue

    const source = node.getSourceFile()
    if (!lines.has(source)) lines.set(source, source.getFullText().split(/\r?\n/))
    const line = node.getStartLineNumber()

    found.push({
      file: source.getFilePath(),
      line,
      text: lines.get(source)![line - 1]?.trim() ?? "",
      symbol: enclosingSymbol(node),
    })
  }

  return found
}

function isTypeDeclaration(node: Node): node is Node & { getName(): string } {
  return Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) || Node.isEnumDeclaration(node)
}

function nameNodeOf(declaration: Node): Node | undefined {
  if (!Node.hasName(declaration)) return
  const name = declaration.getNameNode()
  return Node.isIdentifier(name) ? name : undefined
}

/** The top-level statement a node sits in, named. */
function enclosingSymbol(node: Node): string | undefined {
  let current = node
  while (true) {
    const parent = current.getParent()
    if (!parent) return
    if (Node.isSourceFile(parent)) break
    current = parent
  }

  if (Node.isVariableStatement(current)) return current.getDeclarations()[0]?.getName()
  return Node.hasName(current) ? current.getName() : undefined
}

function truncate(text: string): string {
  return text.length > MAX_TYPE_TEXT ? `${text.slice(0, MAX_TYPE_TEXT)}…` : text
}
