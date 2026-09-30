import { resolve } from "node:path"
import { Node, SyntaxKind, ts } from "ts-morph"
import type { ClassDeclaration, Project, SourceFile, VariableStatement } from "ts-morph"
import { createProject } from "../project"
import { isExported } from "../utils/declarations"

export type SymbolKind = "function" | "class" | "interface" | "type" | "variable" | "enum"

export type MethodInfo = {
  name: string
  signature: string
  docs?: string
}

export type SymbolInfo = {
  name: string
  kind: SymbolKind
  exported: boolean
  /** abbreviated signature, ie "function foo(a: string): number" */
  signature: string
  docs?: string
  /** full source text of the declaration */
  text: string
  line: number
  /** only present for classes */
  methods?: MethodInfo[]
}

export type ProjectSymbol = {
  name: string
  kind: SymbolKind
  /** absolute path of the declaring file */
  file: string
  exported: boolean
  line: number
}

/** a module-scope declaration and the statement that carries its modifiers and comments */
export type Declared = {
  node: Node
  /** the variable statement for a declarator, the declaration itself otherwise */
  statement: Node
  name: string
  kind: SymbolKind
}

const MAX_SIGNATURE = 140

/** Named module-scope declarations of a file, in source order. Names bound by a pattern are skipped. */
export function declaredSymbols(file: SourceFile): Declared[] {
  const found: Declared[] = []

  for (const statement of file.getStatements()) {
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) {
        if (!Node.isIdentifier(declaration.getNameNode())) continue
        found.push({ node: declaration, statement, name: declaration.getName(), kind: "variable" })
      }
      continue
    }

    const kind = kindOf(statement)
    if (!kind || !Node.hasName(statement)) continue
    found.push({ node: statement, statement, name: statement.getName(), kind })
  }

  return found
}

/** Everything declared at the top level of one file. */
export function symbolsOf(file: SourceFile): SymbolInfo[] {
  return declaredSymbols(file).map(declared => ({
    name: declared.name,
    kind: declared.kind,
    exported: isExported(declared.node),
    signature: signatureOf(declared),
    docs: docsOf(declared.statement),
    text: declared.statement.getText({ includeJsDocComments: true }),
    line: declared.node.getStartLineNumber(),
    methods: Node.isClassDeclaration(declared.node) ? methodsOf(declared.node) : undefined,
  }))
}

/** Same, for a file loaded on its own: nothing is resolved across files, so this stays cheap. */
export function listSymbols(file: string): SymbolInfo[] {
  const path = resolve(file)
  return symbolsOf(createProject(path, [path]).getSourceFileOrThrow(path))
}

/** Every top-level symbol of a project, without the source text. */
export function projectSymbols(project: Project): ProjectSymbol[] {
  return project.getSourceFiles().flatMap(file =>
    declaredSymbols(file).map(declared => ({
      name: declared.name,
      kind: declared.kind,
      file: file.getFilePath(),
      exported: isExported(declared.node),
      line: declared.node.getStartLineNumber(),
    })),
  )
}

export function listProjectSymbols(root: string): ProjectSymbol[] {
  return projectSymbols(createProject(root))
}

function kindOf(node: Node): SymbolKind | undefined {
  if (Node.isFunctionDeclaration(node)) return "function"
  if (Node.isClassDeclaration(node)) return "class"
  if (Node.isInterfaceDeclaration(node)) return "interface"
  if (Node.isTypeAliasDeclaration(node)) return "type"
  if (Node.isEnumDeclaration(node)) return "enum"
  if (Node.isVariableDeclaration(node)) return "variable"
}

function signatureOf({ node, statement }: Declared): string {
  const head = headOf(node)
  if (!Node.isVariableDeclaration(node)) return abbreviate(head)
  return abbreviate(`${(statement as VariableStatement).getDeclarationKind()} ${head}`)
}

/** A declaration's text up to whatever body it has: the interesting half of a signature. */
function headOf(node: Node): string {
  const cut = bodyStart(node)
  const text = node.getText()
  return cut === undefined ? text : text.slice(0, cut - node.getStart())
}

function bodyStart(node: Node): number | undefined {
  if (Node.isBodyable(node) || Node.isBodied(node)) return node.getBody()?.getStart()
  if (Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node) || Node.isEnumDeclaration(node)) {
    return node.getFirstChildByKind(SyntaxKind.OpenBraceToken)?.getStart()
  }
  if (Node.isTypeAliasDeclaration(node)) {
    const type = node.getTypeNode()
    if (Node.isTypeLiteral(type)) return type.getStart()
  }
  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer()
    if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
      return initializer.getBody().getStart()
    }
  }
}

function methodsOf(node: ClassDeclaration): MethodInfo[] | undefined {
  const methods = node.getMethods().map(method => ({
    name: method.getName(),
    signature: abbreviate(headOf(method)),
    docs: docsOf(method),
  }))
  return methods.length ? methods : undefined
}

/** One line, with the modifiers that say nothing about the shape dropped, truncated. */
function abbreviate(text: string): string {
  // a dangling `=` is where a body was cut off; a dangling `=>` is worth keeping, it reads as one
  const trimmed = text
    .replace(/\s+/g, " ")
    .replace(/^(export\s+(default\s+)?|declare\s+)+/, "")
    .trim()
    .replace(/\s*=$/, "")
  return trimmed.length > MAX_SIGNATURE ? `${trimmed.slice(0, MAX_SIGNATURE)}…` : trimmed
}

/** The jsdoc of a declaration, or the plain comment sitting directly above it. */
function docsOf(node: Node): string | undefined {
  if (Node.isJSDocable(node)) {
    const text = node
      .getJsDocs()
      .map(doc => doc.getInnerText().trim())
      .filter(Boolean)
      .join("\n\n")
    if (text) return text
  }
  return leadingComment(node)
}

function leadingComment(node: Node): string | undefined {
  const full = node.getSourceFile().getFullText()
  const last = (ts.getLeadingCommentRanges(full, node.getPos()) ?? []).at(-1)
  if (!last) return
  // only a comment attached to the declaration counts, not one left further up the file
  if (!/^\s*$/.test(full.slice(last.end, node.getStart()))) return
  return stripComment(full.slice(last.pos, last.end)) || undefined
}

function stripComment(raw: string): string {
  return raw
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(\/\/|\*)\s?/, "").trimEnd())
    .join("\n")
    .trim()
}
