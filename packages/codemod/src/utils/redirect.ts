import { Node, SyntaxKind, ts, type ExportDeclaration, type ExportSpecifier, type Identifier, type ImportDeclaration, type ImportSpecifier, type Project, type SourceFile } from "ts-morph"
import { addNamedImport, getImportsOf, removeImportSpecifier } from "./imports"
import { removeExportSpecifier } from "./removal"

export type ExportTarget = {
  /* the file that now provides the export */
  file: SourceFile
  /* the name the export goes by in that file */
  name: string
}

/* exported name -> where that export now lives */
export type ExportMap = Map<string, ExportTarget>

type Pending = [from: SourceFile, renames: ExportMap]

/* Reads the named re-exports of a barrel file (`export { a as b } from "./x"`) into a
map from the name the barrel exports to the file and name it forwards to.
`export *` declarations are not expanded. */
export function getReExportTargets(file: SourceFile): ExportMap {
  const map: ExportMap = new Map()
  for (const decl of file.getExportDeclarations()) {
    const target = decl.getModuleSpecifierSourceFile()
    if (!target) continue
    for (const spec of decl.getNamedExports()) {
      const name = spec.getName()
      map.set(spec.getAliasNode()?.getText() ?? name, { file: target, name })
    }
  }
  return map
}

/* Points every import and re-export of the mapped names of a source file at the file
and name they now live under, renaming local references when the local name changes.
Aliases the importer chose are kept, and an alias is added when the new name would
clash with something already in scope. An import keeps the shape it had: a type-only
declaration stays one, an inline `type` specifier stays inline. When a file re-exports a
mapped name under its own name (`export { A } from`, `export { A }`, `export *`), the
rename follows through to that file's importers as well. Namespace imports and `export *`
are repointed when every mapped name lives in a single file. The source file itself is
left untouched. */
export function redirectExports(project: Project, source: SourceFile, renames: ExportMap): void {
  const queue: Pending[] = [[source, renames]]
  for (let item = queue.shift(); item; item = queue.shift()) {
    const [from, map] = item
    for (const file of project.getSourceFiles()) {
      if (file === from) continue
      for (const decl of getImportsOf(file, from)) {
        if (!decl.wasForgotten()) redirectImport(decl, from, map, queue)
      }
      for (const decl of file.getExportDeclarations()) {
        if (!decl.wasForgotten() && decl.getModuleSpecifierSourceFile() === from) redirectReExport(decl, from, map, queue)
      }
    }
  }
}

function redirectImport(decl: ImportDeclaration, from: SourceFile, renames: ExportMap, queue: Pending[]) {
  if (decl.getNamespaceImport()) return redirectNamespace(decl, from, renames)
  for (const spec of decl.getNamedImports()) {
    const target = renames.get(spec.getName())
    if (target) redirectSpecifier(spec, from, target, queue)
  }
}

function redirectSpecifier(spec: ImportSpecifier, from: SourceFile, target: ExportTarget, queue: Pending[]) {
  const file = spec.getSourceFile()
  const decl = spec.getImportDeclaration()
  const alias = spec.getAliasNode()?.getText()
  const local = alias ?? spec.getName()
  const references = getReferences(spec)
  const isTypeOnly = decl.isTypeOnly()
  const inlineType = spec.isTypeOnly()
  // an aliased import needs a binding of its own, so an existing one is never reused for it
  const state = alias ? "free" : getNameState(file, target, !isTypeOnly && !inlineType)
  const wanted = alias ?? (state === "taken" ? local : target.name)

  if (target.file === from && state !== "imported") {
    spec.setName(target.name)
    if (!alias && wanted !== target.name) spec.setAlias(wanted)
  } else {
    const insertIndex = decl.getChildIndex()
    removeImportSpecifier(spec)
    if (state !== "imported") {
      addNamedImport(file, target.file, target.name, {
        alias: wanted === target.name ? undefined : wanted,
        isTypeOnly,
        inlineType,
        insertIndex,
      })
    }
  }

  if (wanted !== local) renameReferences(references, wanted, queue)
}

// "imported": the file already has a binding of the target that this import can reuse
// "taken": the name is already spoken for, so the importer keeps the name it used
function getNameState(file: SourceFile, target: ExportTarget, needsValue: boolean): "free" | "imported" | "taken" {
  const symbol = file.getLocal(target.name)
  if (!symbol) return "free"

  const declarations = symbol.getDeclarations()
  const bindings = declarations.filter((node): node is ImportSpecifier =>
    Node.isImportSpecifier(node)
    && !node.getAliasNode()
    && node.getName() === target.name
    && node.getImportDeclaration().getModuleSpecifierSourceFile() === target.file)
  if (bindings.length !== declarations.length) return "taken"

  // a value use cannot borrow a type-only binding: an inline `type` can be widened in place,
  // a type-only declaration cannot, so that one falls back to keeping the importer's own name
  if (needsValue) {
    if (bindings.some(binding => binding.getImportDeclaration().isTypeOnly())) return "taken"
    for (const binding of bindings) if (binding.isTypeOnly()) binding.setIsTypeOnly(false)
  }
  return "imported"
}

function getReferences(spec: ImportSpecifier): Identifier[] {
  const binding = spec.getAliasNode() ?? spec.getNameNode()
  const symbol = resolveSymbol(binding)
  if (!symbol) return []
  const name = binding.getText()
  return spec.getSourceFile()
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(id => id.getText() === name && id.getParent() !== spec && resolveSymbol(id) === symbol)
}

// resolves an identifier to the symbol it ultimately names, looking through import aliases,
// shorthand properties and local export specifiers
function resolveSymbol(node: Node): ts.Symbol | undefined {
  const checker = node.getProject().getTypeChecker().compilerObject
  const parent = node.getParent()
  let symbol: ts.Symbol | undefined
  if (Node.isShorthandPropertyAssignment(parent)) {
    symbol = checker.getShorthandAssignmentValueSymbol(parent.compilerNode)
  } else if (Node.isExportSpecifier(parent)) {
    if (parent.getExportDeclaration().getModuleSpecifier() || node !== parent.getNameNode()) return undefined
    symbol = checker.getExportSpecifierLocalTargetSymbol(parent.compilerNode)
  } else {
    symbol = checker.getSymbolAtLocation(node.compilerNode)
  }
  return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function renameReferences(references: Identifier[], name: string, queue: Pending[]) {
  for (const id of references) {
    const old = id.getText()
    const parent = id.getParent()
    if (Node.isShorthandPropertyAssignment(parent)) {
      // keep the object key, only the value changes
      parent.replaceWithText(`${old}: ${name}`)
    } else if (Node.isExportSpecifier(parent) && !parent.getAliasNode()) {
      // `export { Old }` -> `export { New }`: the file's public name changes, follow it through
      parent.setName(name)
      const file = parent.getSourceFile()
      queue.push([file, new Map([[old, { file, name }]])])
    } else {
      id.replaceWithText(name)
    }
  }
}

function redirectNamespace(decl: ImportDeclaration, from: SourceFile, renames: ExportMap) {
  const target = getSingleTarget(renames)
  const symbol = resolveSymbol(decl.getNamespaceImportOrThrow())
  const members = decl.getSourceFile().getDescendants().flatMap(node => {
    const [left, right] = Node.isPropertyAccessExpression(node) ? [node.getExpression(), node.getNameNode()]
      : Node.isQualifiedName(node) ? [node.getLeft(), node.getRight()]
      : []
    return left && right && Node.isIdentifier(left) && renames.has(right.getText()) && resolveSymbol(left) === symbol ? [right] : []
  })
  for (const member of members) {
    const name = renames.get(member.getText())!.name
    if (name !== member.getText()) member.replaceWithText(name)
  }
  if (target !== from) decl.setModuleSpecifier(target)
}

function redirectReExport(decl: ExportDeclaration, from: SourceFile, renames: ExportMap, queue: Pending[]) {
  const file = decl.getSourceFile()
  const pending: ExportMap = new Map()

  if (!decl.hasNamedExports()) {
    if (decl.getNamespaceExport()) throw new Error(`redirectExports: \`export * as\` of ${from.getBaseName()} in ${file.getFilePath()} is not supported`)
    const target = getSingleTarget(renames)
    for (const [exported, { name }] of renames) {
      if (exported !== name) pending.set(exported, { file, name })
    }
    if (target !== from) decl.setModuleSpecifier(target)
  } else {
    for (const spec of decl.getNamedExports()) {
      const target = renames.get(spec.getName())
      if (!target) continue
      const alias = spec.getAliasNode()?.getText()
      if (!alias && spec.getName() !== target.name) pending.set(spec.getName(), { file, name: target.name })
      if (target.file === from) spec.setName(target.name)
      else moveReExport(spec, target, alias)
    }
  }

  if (pending.size) queue.push([file, pending])
}

function moveReExport(spec: ExportSpecifier, target: ExportTarget, alias: string | undefined) {
  const decl = spec.getExportDeclaration()
  const file = decl.getSourceFile()
  const isTypeOnly = decl.isTypeOnly()
  const structure = { name: target.name, alias: alias === target.name ? undefined : alias, isTypeOnly: spec.isTypeOnly() }
  const existing = file.getExportDeclarations().find(d =>
    d !== decl
    && d.hasNamedExports()
    && d.isTypeOnly() === isTypeOnly
    && d.getModuleSpecifierSourceFile() === target.file)

  if (!existing) {
    file.insertExportDeclaration(decl.getChildIndex(), {
      moduleSpecifier: file.getRelativePathAsModuleSpecifierTo(target.file),
      isTypeOnly,
      namedExports: [structure],
    })
  } else if (!existing.getNamedExports().some(s => s.getName() === target.name && s.getAliasNode()?.getText() === structure.alias)) {
    existing.addNamedExport(structure)
  }

  removeExportSpecifier(spec)
}

function getSingleTarget(renames: ExportMap): SourceFile {
  const files = [...new Set([...renames.values()].map(t => t.file))]
  if (files.length !== 1) throw new Error(`redirectExports: cannot repoint a namespace or star export across ${files.length} files`)
  return files[0]!
}
