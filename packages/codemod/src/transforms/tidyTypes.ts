import {
  Node,
  SyntaxKind,
  type Identifier,
  type InterfaceDeclaration,
  type Project,
  type PropertySignature,
  type TypeAliasDeclaration,
  type TypeLiteralNode,
} from "ts-morph"
import { getDeclarationsNamed, isExported } from "../utils/declarations"
import { copyImportsFor, removeUnusedImports } from "../utils/imports"
import { isMemberName } from "../utils/nodes"
import { getLocalDependencies } from "../utils/references"
import { removeNode } from "../utils/removal"
import { retargetReferences } from "../utils/retarget"
import { hasExports } from "../utils/source-files"

/*
tidyTypes consolidates object-shaped types (interfaces and `type X = { ... }` aliases
whose members are all plain properties, with no generics and no `extends`).

1. identical shapes, any names → folded into one canonical declaration.
   exported types fold across the project; non-exported types only fold within their own file.
   repeats until nothing folds, since a fold can make two other shapes identical.
2. same name, similar shape → the canonical declaration is widened to the union of fields.
   only exported types are considered. fields missing somewhere become optional.
   a group is skipped when a shared field disagrees on its type.

the canonical is the exported one, then the most referenced, then the first by path.
a folded declaration is deleted, unless something still needs the name (a barrel re-export,
`ns.Name`). in that case it becomes a type-only forward to the canonical.
*/
export function tidyTypes(project: Project) {
  for (let pass = 0; pass < MAX_PASSES && dedupeIdentical(project); pass++) { }
  mergeSimilar(project)
}

/* shapes with fewer fields than this are too generic to be deduped by structure */
const MIN_FIELDS = 2
/* shared fields / all fields a same-name group needs before it gets merged */
const SIMILARITY = 0.5
const MAX_PASSES = 5

type ShapeDecl = InterfaceDeclaration | TypeAliasDeclaration

type Prop = {
  node: PropertySignature
  optional: boolean
  readonly: boolean
  /* type text with every type name resolved to its fully qualified symbol */
  type: string
}

type Shape = {
  decl: ShapeDecl
  body: InterfaceDeclaration | TypeLiteralNode
  props: Map<string, Prop>
}

function dedupeIdentical(project: Project): boolean {
  let folded = false
  for (const group of groupBy(collectShapes(project), exactKey).values()) {
    if (group[0]!.props.size < MIN_FIELDS) continue
    folded = dedupe(group) || folded
  }
  return folded
}

function dedupe(group: Shape[]): boolean {
  if (group.length < 2) return false
  const [canon, ...rest] = rank(group)
  const folds = rest.filter(s => sameFile(s, canon!) || (isExported(s.decl) && isExported(canon!.decl)))
  for (const dup of folds) fold(dup.decl, canon!.decl)

  // leftovers are local types in other files: they may still dedupe among their own file
  let folded = folds.length > 0
  const left = rest.filter(s => !folds.includes(s))
  for (const g of groupBy(left, s => s.decl.getSourceFile().getFilePath()).values()) folded = dedupe(g) || folded
  return folded
}

function mergeSimilar(project: Project) {
  const exported = collectShapes(project).filter(s => isExported(s.decl))
  for (const group of groupBy(exported, s => s.decl.getName()).values()) {
    if (group.length < 2 || !isSimilar(group)) continue
    const [canon, ...rest] = rank(group)
    widen(canon!, rest)
    for (const dup of rest) fold(dup.decl, canon!.decl)
  }
}

function isSimilar(group: Shape[]): boolean {
  const names = new Set(group.flatMap(s => [...s.props.keys()]))
  const shared = [...names].filter(name => group.every(s => s.props.has(name)))
  if (shared.length / names.size < SIMILARITY) return false
  return [...names].every(name => {
    const props = group.flatMap(s => s.props.get(name) ?? [])
    return new Set(props.map(p => p.type)).size === 1
      && props.every(p => getLocalDependencies(p.node).length === 0)
  })
}

function widen(canon: Shape, rest: Shape[]) {
  const all = [canon, ...rest]
  const readonlyEverywhere = (name: string) => all.every(s => s.props.get(name)?.readonly ?? true)

  for (const [name, prop] of canon.props) {
    const optional = all.some(s => !s.props.has(name) || s.props.get(name)!.optional)
    if (optional && !prop.optional) prop.node.setHasQuestionToken(true)
    if (prop.readonly && !readonlyEverywhere(name)) prop.node.setIsReadonly(false)
  }

  const extras = new Map<string, Prop>()
  for (const s of rest) {
    for (const [name, prop] of s.props) if (!canon.props.has(name) && !extras.has(name)) extras.set(name, prop)
  }
  const file = canon.decl.getSourceFile()
  for (const [name, prop] of extras) {
    copyImportsFor([prop.node], file)
    const { kind, ...structure } = prop.node.getStructure()
    stripSemicolon(canon.body.addProperty({ ...structure, hasQuestionToken: true, isReadonly: readonlyEverywhere(name) }))
  }
}

// ts-morph prints `;` after inserted statements and members; the codebase has none
function stripSemicolon(node: Node) {
  node.getLastChildByKind(SyntaxKind.SemicolonToken)?.replaceWithText("")
}

function fold(dup: ShapeDecl, canon: ShapeDecl) {
  // computed before retargeting, which rewrites the import bindings out from under us
  const bindings = findBindings(dup)
  const stranded = dup.getNameNode().findReferencesAsNodes().some(isMemberName)
  const reexported = bindings.some(Node.isExportSpecifier) || isStarReexported(dup)

  retargetReferences(dup, canon, true)
  if (stranded || reexported) return forward(dup, canon)

  // bindings still standing were imports of the dup that nothing used
  for (const binding of bindings) if (!binding.wasForgotten()) removeNode(binding)
  const file = dup.getSourceFile()
  dup.remove()
  removeUnusedImports(file)
}

/*
The import and export specifiers across the project that bind this declaration's name.
getBindings resolves them through the language service, which does not hand back the
specifier of a barrel's `export { X } from "./x"`, so these are found structurally: the
declarations whose module specifier resolves to this file, then the names they bind.
*/
function findBindings(decl: ShapeDecl): Node[] {
  const file = decl.getSourceFile()
  const name = decl.getName()
  const found: Node[] = []
  for (const other of decl.getProject().getSourceFiles()) {
    const statements = [...other.getImportDeclarations(), ...other.getExportDeclarations()]
    for (const statement of statements) {
      if (statement.getModuleSpecifierSourceFile() !== file) continue
      const specifiers = Node.isImportDeclaration(statement) ? statement.getNamedImports() : statement.getNamedExports()
      for (const specifier of specifiers) if (specifier.getName() === name) found.push(specifier)
    }
  }
  return found
}

/* `export * from "./x"` re-exports the name without ever spelling it, so the name has to stay */
function isStarReexported(decl: ShapeDecl): boolean {
  const file = decl.getSourceFile()
  return decl.getProject().getSourceFiles().some(other => other !== file
    && other.getExportDeclarations().some(statement => statement.getModuleSpecifierSourceFile() === file
      && statement.getNamedExports().length === 0))
}

/* keeps a folded name alive for re-exports and `ns.Name` uses by pointing it at the canonical */
function forward(dup: ShapeDecl, canon: ShapeDecl) {
  const file = dup.getSourceFile()
  const index = dup.getChildIndex()
  const name = dup.getName()
  const target = canon.getName()
  const statement = canon.getSourceFile() === file
    ? file.insertTypeAlias(index, { name, type: target, isExported: true })
    : file.insertExportDeclaration(index, {
      isTypeOnly: true,
      namedExports: [name === target ? { name } : { name: target, alias: name }],
      moduleSpecifier: file.getRelativePathAsModuleSpecifierTo(canon.getSourceFile()),
    })
  stripSemicolon(statement)
  dup.remove()
  removeUnusedImports(file)
}

function collectShapes(project: Project): Shape[] {
  const shapes: Shape[] = []
  for (const file of project.getSourceFiles()) {
    if (file.isDeclarationFile() || file.isInNodeModules()) continue
    // script files declare globals; nothing can import from them
    if (!hasExports(file) && file.getImportDeclarations().length === 0) continue
    for (const statement of file.getStatements()) {
      const shape = toShape(statement)
      // declaration merging makes the shape span several statements: leave it alone
      if (shape && getDeclarationsNamed(file, shape.decl.getName()).length === 1) shapes.push(shape)
    }
  }
  return shapes
}

function toShape(node: Node): Shape | undefined {
  if (Node.isInterfaceDeclaration(node)) {
    if (node.getTypeParameters().length || node.getExtends().length || node.hasDeclareKeyword()) return
    return shapeOf(node, node)
  }
  if (Node.isTypeAliasDeclaration(node)) {
    const type = node.getTypeNode()
    if (node.getTypeParameters().length || !type || !Node.isTypeLiteral(type)) return
    return shapeOf(node, type)
  }
}

function shapeOf(decl: ShapeDecl, body: InterfaceDeclaration | TypeLiteralNode): Shape | undefined {
  const members = body.getMembers()
  if (members.length === 0 || !members.every(Node.isPropertySignature)) return
  const props = new Map<string, Prop>()
  for (const node of members as PropertySignature[]) {
    props.set(node.getName(), {
      node,
      optional: node.hasQuestionToken(),
      readonly: node.isReadonly(),
      type: typeKey(node.getTypeNode()),
    })
  }
  return { decl, body, props }
}

function exactKey(shape: Shape): string {
  return [...shape.props]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, p]) => `${p.readonly ? "readonly " : ""}${name}${p.optional ? "?" : ""}:${p.type}`)
    .join(";")
}

/* type text where each type name is swapped for its resolved symbol, so `User` from two files never compares equal */
function typeKey(node: Node | undefined): string {
  if (!node) return "any"
  const start = node.getStart()
  const edits = node.getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(isTypeName)
    .map(id => ({ from: id.getStart() - start, to: id.getEnd() - start, text: resolvedName(id) }))
    .reverse()
  let text = node.getText()
  for (const edit of edits) text = text.slice(0, edit.from) + edit.text + text.slice(edit.to)
  return text.replace(/\s+/g, " ")
}

function isTypeName(id: Identifier): boolean {
  const parent = id.getParent()
  return Node.isTypeReference(parent)
    || Node.isExpressionWithTypeArguments(parent)
    || Node.isTypeQuery(parent)
    || (Node.isQualifiedName(parent) && parent.getRight() === id)
}

function resolvedName(id: Identifier): string {
  let symbol = id.getSymbol()
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol
  return symbol?.getFullyQualifiedName() ?? id.getText()
}

function rank(shapes: Shape[]): Shape[] {
  const refs = new Map(shapes.map(s => [s, s.decl.getNameNode().findReferencesAsNodes().length]))
  return [...shapes].sort((a, b) =>
    Number(isExported(b.decl)) - Number(isExported(a.decl))
    || refs.get(b)! - refs.get(a)!
    || a.decl.getSourceFile().getFilePath().localeCompare(b.decl.getSourceFile().getFilePath())
    || a.decl.getStart() - b.decl.getStart())
}

function sameFile(a: Shape, b: Shape): boolean {
  return a.decl.getSourceFile() === b.decl.getSourceFile()
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return groups
}
