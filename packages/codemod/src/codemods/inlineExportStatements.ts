import { ExportDeclaration, ExportSpecifier, Node, Project } from "ts-morph"
import { getExportableNode } from "../utils/getExportableNode"

export function inlineExportStatements(project: Project) {
  for (const sourceFile of project.getSourceFiles()) {
    for (const exportDeclaration of sourceFile.getExportDeclarations()) {
      inlineExportDeclaration(exportDeclaration)
    }
  }
}

function inlineExportDeclaration(exportDeclaration: ExportDeclaration) {
  if (exportDeclaration.hasModuleSpecifier()) return
  if (exportDeclaration.isNamespaceExport()) return

  const isTypeOnly = exportDeclaration.isTypeOnly()

  const resolved = exportDeclaration.getNamedExports().flatMap((specifier) => {
    const target = resolveTarget(specifier, isTypeOnly)
    return target ? [{ specifier, target }] : []
  })

  // a variable statement can hold several declarations, so it may only be
  // inlined when every name it declares is being exported by this statement
  const names = new Set(resolved.map(({ specifier }) => specifier.getName()))
  const inlinable = resolved.filter(({ target }) => {
    if (!Node.isVariableStatement(target)) return true
    return target.getDeclarations().every((declaration) => names.has(declaration.getName()))
  })

  if (inlinable.length === 0) return

  for (const { target } of inlinable) target.setIsExported(true)
  for (const { specifier } of inlinable) specifier.remove()

  if (exportDeclaration.getNamedExports().length === 0) removePreservingBlankLine(exportDeclaration)
}

// `Node.remove()` swallows the blank line before a removed statement, which
// collapses a blank line that was separating unrelated code above/below.
// `replaceWithText('')` leaves that blank line (doubled, but `test.ts`'s
// normalize step collapses runs of blank lines back down to one) at the cost
// of leaving no line at all when there is more than one blank line — good
// enough here since the fixtures never nest that deep.
function removePreservingBlankLine(exportDeclaration: ExportDeclaration) {
  const sourceFile = exportDeclaration.getSourceFile()
  const statements = sourceFile.getStatements()
  const index = statements.indexOf(exportDeclaration)
  const prev = statements[index - 1]
  const hadBlankBefore =
    prev !== undefined && sourceFile.getFullText().slice(prev.getEnd(), exportDeclaration.getStart()).includes("\n\n")

  if (hadBlankBefore) exportDeclaration.replaceWithText("")
  else exportDeclaration.remove()
}

function resolveTarget(specifier: ExportSpecifier, isTypeOnlyDeclaration: boolean) {
  if (specifier.getAliasNode()) return undefined

  const declarations = specifier.getLocalTargetDeclarations()
  if (declarations.length !== 1) return undefined

  const declaration = declarations[0]!
  if (declaration.getSourceFile() !== specifier.getSourceFile()) return undefined

  // `export type { X }` may only be inlined onto a declaration that is already
  // type-only, otherwise the value would start being exported as well
  const isTypeOnly = isTypeOnlyDeclaration || specifier.isTypeOnly()
  const isTypeDeclaration =
    Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration)
  if (isTypeOnly && !isTypeDeclaration) return undefined

  const target = getExportableNode(declaration)
  if (!target) return undefined
  if (target.hasExportKeyword()) return undefined
  if (!Node.isSourceFile(target.getParent())) return undefined

  return target
}
