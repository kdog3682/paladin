import { Node, Project, SourceFile } from "ts-morph"
import { getImportsOf } from "./imports"

/**
 * Inserts statement text below the last import declaration in a file.
 * Codemods that add declarations need a safe top-of-file slot that never lands above the imports.
 */
export function insertAfterImports(file: SourceFile, text: string): void {
  let index = 0
  file.getStatements().forEach((statement, position) => {
    if (Node.isImportDeclaration(statement)) index = position + 1
  })
  const hasFollowingStatement = index < file.getStatements().length
  const inserted = file.insertStatements(index, text)
  const last = inserted[inserted.length - 1]
  if (hasFollowingStatement && last) file.insertText(last.getEnd(), '\n')
}

/**
 * Tells whether a file still exposes anything: exported statements, export declarations, or `export =`.
 * Deciding whether a module has become dead code requires checking all three forms, not just modifiers.
 */
export function hasExports(file: SourceFile): boolean {
  if (file.getExportDeclarations().length > 0) return true
  if (file.getExportAssignments().length > 0) return true
  return file.getStatements().some(statement => Node.isExportable(statement) && statement.isExported())
}

/**
 * Tells whether a file contains nothing but import declarations.
 * The cheap "is there anything left worth keeping" test after a codemod strips a module down.
 */
export function hasOnlyImports(file: SourceFile): boolean {
  return file.getStatements().every(statement => Node.isImportDeclaration(statement))
}

/**
 * Deletes a source file and removes every import of it from the rest of the project.
 * Deleting a module without this leaves unresolvable specifiers behind and breaks the build.
 */
export function deleteFile(project: Project, file: SourceFile): void {
  const path = file.getFilePath()
  for (const other of project.getSourceFiles()) {
    if (other.getFilePath() === path) continue
    for (const declaration of getImportsOf(other, file)) declaration.remove()
  }
  file.delete()
}
