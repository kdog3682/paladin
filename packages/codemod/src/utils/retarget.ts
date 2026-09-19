import { Node, type Identifier, type SourceFile } from "ts-morph"
import { isExported } from "./declarations"
import { getExportableNode } from "./getExportableNode"
import { addNamedImport, getImportsOf, removeImportSpecifier } from "./imports"
import { groupByFile, isMemberName } from "./nodes"
import { isBindingSite } from "./references"

type NamedDeclaration = Node & {
  getName(): string
  getNameNode(): Node
}

/*
Points every use of one module-scope declaration at another. Uses are renamed to the
target, or keep their local name when it was an import alias or the target's name is
already taken in that file. The old import binding is swapped for an import of the
target, and the target is exported once another file needs it. Binding sites
(re-exports), `ns.Name` member uses and default/namespace imports are left alone, so
the caller decides what happens to the old declaration. Returns the files it touched.
*/
export function retargetReferences(from: NamedDeclaration, to: NamedDeclaration, isTypeOnly = false): SourceFile[] {
  const target = to.getSourceFile()
  const targetName = to.getName()
  const nameNode = from.getNameNode()
  if (!Node.isReferenceFindable(nameNode)) return []

  const uses = nameNode.findReferencesAsNodes().filter((node): node is Identifier =>
    Node.isIdentifier(node) && node !== nameNode && !isBindingSite(node) && !isMemberName(node))

  const touched: SourceFile[] = []
  for (const [file, ids] of groupByFile(uses)) {
    if (file === target) {
      rename(ids, targetName)
      touched.push(file)
      continue
    }
    for (const local of new Set(ids.map(id => id.getText()))) {
      const group = ids.filter(id => id.getText() === local)
      const binding = getLocalBinding(group[0]!)
      if (binding && !Node.isImportSpecifier(binding)) continue

      const keepLocal = local !== from.getName() || collides(file, targetName, [from, to])
      const name = keepLocal ? local : targetName
      let index: number | undefined
      if (binding) {
        index = binding.getImportDeclaration().getChildIndex()
        removeImportSpecifier(binding)
      }
      importTarget(file, target, targetName, name === targetName ? undefined : name, isTypeOnly, index)
      rename(group, name)
      if (!touched.includes(file)) touched.push(file)
    }
  }

  if (touched.some(file => file !== target) && !isExported(to)) {
    const exportable = getExportableNode(to)
    if (exportable && Node.isExportable(exportable)) exportable.setIsExported(true)
  }
  return touched
}

/* addNamedImport only reuses declarations of the same type-only-ness, so a binding already
   imported the other way (value vs type) is checked here to avoid importing the name twice */
function importTarget(file: SourceFile, target: SourceFile, name: string, alias: string | undefined, isTypeOnly: boolean, index?: number) {
  const existing = getImportsOf(file, target)
    .flatMap(decl => decl.getNamedImports())
    .find(spec => spec.getName() === name && spec.getAliasNode()?.getText() === alias)
  if (existing) return
  addNamedImport(file, target, name, { alias, isTypeOnly, insertIndex: index })
}

function rename(ids: Identifier[], name: string) {
  for (const id of [...ids].reverse()) if (id.getText() !== name) id.replaceWithText(name)
}

function getLocalBinding(id: Identifier): Node | undefined {
  const file = id.getSourceFile()
  return id.getSymbol()?.getDeclarations().find(d => d.getSourceFile() === file && (
    Node.isImportSpecifier(d) || Node.isImportClause(d) || Node.isNamespaceImport(d) || Node.isImportEqualsDeclaration(d)))
}

function collides(file: SourceFile, name: string, owners: Node[]): boolean {
  const symbol = file.getLocal(name)
  if (!symbol) return false
  const resolved = symbol.isAlias() ? symbol.getAliasedSymbol() ?? symbol : symbol
  return !resolved.getDeclarations().some(d => owners.some(owner => owner === d))
}
