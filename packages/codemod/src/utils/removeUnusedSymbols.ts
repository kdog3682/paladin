import { Node, type Project, type SourceFile, type Statement } from "ts-morph"
import { isExported } from "./declarations"
import { removeUnusedImports } from "./imports"
import {
  getBindings,
  getImportedDependencies,
  getLocalDependencies,
  isStarReexported,
  isUnused,
} from "./references"
import { removeNode } from "./removal"
import { deleteFile } from "./source-files"

type RemoveUnusedSymbolsOpts = {
  /** the files whose declarations may be removed; defaults to every project file outside node_modules that isn't a .d.ts */
  files?: SourceFile[]
  /** declarations that must stay even when nothing uses them, eg a package's public entry points */
  keep?: (statement: Statement) => boolean
}

/**
 * Deletes the exported module-scope declarations of the given files that nothing in the project
 * uses any more, along with the import and export specifiers that only re-bind them. The removal
 * cascades: whatever a deleted declaration relied on within the given files, exported or not, is
 * checked again, until nothing more becomes unused. Default exports and names exposed through
 * `export *` are kept. Imports left unused in touched files are dropped, and a file of the given
 * set that ends up with no statements is deleted. Returns the files it touched and kept.
 */
export function removeUnusedSymbols(project: Project, opts: RemoveUnusedSymbolsOpts = {}): SourceFile[] {
  const files = new Set(
    opts.files ?? project.getSourceFiles().filter(file => !file.isInNodeModules() && !file.isDeclarationFile()),
  )
  const keep = opts.keep ?? (() => false)

  const queue = new Set<Statement>()
  for (const file of files)
    for (const statement of file.getStatements())
      if (isDeclarationStatement(statement) && isExportedStatement(statement)) queue.add(statement)

  const touched = new Set<SourceFile>()
  while (queue.size) {
    const [statement] = queue
    queue.delete(statement)
    if (statement.wasForgotten() || !isRemovable(statement, keep)) continue

    const dependencies = [...getLocalDependencies(statement), ...getImportedDependencies(statement)]
    touched.add(statement.getSourceFile())
    for (const binding of getBindings(statement)) {
      if (binding.wasForgotten()) continue
      touched.add(binding.getSourceFile())
      removeNode(binding)
    }
    statement.remove()

    // what the removed declaration relied on may be unused now; re-queue it even if it was checked before
    for (const dependency of dependencies)
      if (!dependency.wasForgotten() && Node.isStatement(dependency) && files.has(dependency.getSourceFile()))
        queue.add(dependency)
  }

  const kept: SourceFile[] = []
  for (const file of touched) {
    if (file.wasForgotten()) continue
    removeUnusedImports(file)
    if (files.has(file) && file.getStatements().length === 0) deleteFile(project, file)
    else kept.push(file)
  }
  return kept
}

function isRemovable(statement: Statement, keep: (statement: Statement) => boolean): boolean {
  if (!isDeclarationStatement(statement)) return false
  if (Node.isExportable(statement) && statement.isDefaultExport()) return false
  if (keep(statement)) return false
  return isUnused(statement) && !isStarReexported(statement)
}

/** Declarations a name can be removed with. Namespaces and `declare global` are left alone. */
function isDeclarationStatement(statement: Statement): boolean {
  return Node.isFunctionDeclaration(statement) ||
    Node.isClassDeclaration(statement) ||
    Node.isInterfaceDeclaration(statement) ||
    Node.isTypeAliasDeclaration(statement) ||
    Node.isEnumDeclaration(statement) ||
    Node.isVariableStatement(statement)
}

/** Whether a statement is exported, directly or through a local `export { name }`. */
function isExportedStatement(statement: Statement): boolean {
  const declarations = Node.isVariableStatement(statement) ? statement.getDeclarations() : [statement]
  return declarations.some(isExported)
}
